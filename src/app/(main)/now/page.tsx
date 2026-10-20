'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import ActiveSessionCard from '@/components/ActiveSessionCard';
import BalanceBanner from '@/components/BalanceBanner';
import BedtimeSheet from '@/components/BedtimeSheet';
import CategoryGrid from '@/components/CategoryGrid';
import ClarifyCard from '@/components/ClarifyCard';
import StaleSessionModal from '@/components/StaleSessionModal';
import MicButton from '@/components/MicButton';
import NextEventBanner from '@/components/NextEventBanner';
import ParseConfirmCard from '@/components/ParseConfirmCard';
import ReminderBanner from '@/components/ReminderBanner';
import RecordSheet, { type SheetTarget } from '@/components/RecordSheet';
import ScheduledCard from '@/components/ScheduledCard';
import SheetShell from '@/components/SheetShell';
import { type StartWhen } from '@/components/StartWhenSheet';
import RoutineChecklist from '@/components/RoutineChecklist';
import Toasts from '@/components/Toasts';
import VoiceSheet from '@/components/VoiceSheet';
import WeeklyReview from '@/components/WeeklyReview';
import MoonIcon from '@/components/MoonIcon';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/contexts/AuthContext';
import {
  capWait,
  useActiveActivities,
  useDayActivities,
  useScheduledActivities,
  useTick,
  useToasts,
  useWeekActivities,
} from '@/hooks/useActivities';
import { bedtimeDate, logBedtime, useRecentBedtime } from '@/hooks/useBedtime';
import { useReminders } from '@/hooks/useReminders';
import { useReviewDue } from '@/hooks/useReview';
import { useFlip } from '@/hooks/useFlip';
import { useCurrentWeek, useRollover, useWeekTarget } from '@/hooks/useTargets';
import { useRoutineChecks, useRoutines } from '@/hooks/useRoutine';
import { useVoice } from '@/hooks/useVoice';
import { ActivityError, deleteActivity, startActivity, stopActivity } from '@/lib/activities';
import { actualHours, findStale, logicalDate, logicalWeekday, overlapHours } from '@/lib/balance';
import { pickBalance } from '@/lib/banner';
import { clearBedtime } from '@/lib/bedtime-store';
import { formatBedtime } from '@/lib/bedtime';
import { leavingItems, reducedMotion } from '@/lib/motion';
import { clockTime, formatDuration, roundDown } from '@/lib/datetime';
import { nowTiles } from '@/lib/day-progress';
import { routineForDay } from '@/lib/routine';
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

/** From 3 parallel sessions up, cards collapse so Now still fits one screen. */
const COMPACT_FROM = 3;

/** Matches `.row-out` in globals.css. */
const CARD_EXIT_MS = 180;

const ignore = () => {};

/** "2026-08-26" → "Wednesday, Aug 26". Parsed by hand to avoid timezone shifts. */
function prettyLogicalDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function NowPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // Weekly Review: banner from 19:00 Sunday, valid until the end of Tuesday.
  const reviewWeek = useReviewDue();
  const [reviewOpen, setReviewOpen] = useState<string | null>(null);

  // The logical day turns at 04:00, not midnight → a 60s tick is enough.
  const nowMinute = useTick(60_000, true);
  const today = logicalDate(nowMinute);

  const { activities: active, loading: activeLoading, pendingIds } = useActiveActivities();
  const { activities: scheduled, pendingIds: scheduledPending } = useScheduledActivities();
  const { activities: todayActivities } = useDayActivities(today);
  const { toasts, push, dismiss } = useToasts();

  // Week rollover. There is no cron, so it hooks onto the app being opened.
  // Idempotent, so extra calls are harmless.
  useRollover();

  // Weekly balance. One line, or none.
  const week = useCurrentWeek();
  const { target: weekTarget } = useWeekTarget(week);
  const { activities: weekActivities } = useWeekActivities(week);
  const balanceLine = useMemo(
    () => pickBalance(weekActivities, weekTarget?.weekly ?? null, nowMinute),
    [weekActivities, weekTarget, nowMinute]
  );

  // Reminders beat the balance banner: they have a more concrete action.
  const { reminder, dismiss: dismissReminder } = useReminders(
    todayActivities,
    weekActivities,
    weekTarget?.weekly ?? null
  );
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  // A sub-minute record waiting for the user to confirm (4.6 Task 5).
  const [zeroStop, setZeroStop] = useState<{ id: string; at: number } | null>(null);

  const voice = useVoice(uid, active, push);

  // While the voice card is open, the FAB steps aside.
  const voiceCardOpen = voice.pending !== null || voice.clarify !== null;

  // When voice is stuck there must be a way out: the manual sheet, for the last hour.
  const openManual = useCallback(() => {
    const end = roundDown(Date.now(), 15);
    setSheet({ mode: 'create', startAt: end - 3_600_000, endAt: end });
  }, []);

  // Overlap shows in hours with one decimal - each step is 6 minutes. A
  // per-second tick here would re-render the WHOLE page 60 times a minute for
  // the same number. The seconds clock lives in each card (`useElapsed`).
  const overlap = useMemo(
    () => (active.length > 1 ? overlapHours(active, nowMinute) : 0),
    [active, nowMinute]
  );

  const running = useMemo(() => new Set(active.map((a) => a.category)), [active]);

  // Cards rise in when a session starts while the page is open, and slide out
  // when it stops. The stream drops a stopped session at once, so it is kept
  // here for the exit animation. Data from the first load just appears.
  const [ready, setReady] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  const [leaving, setLeaving] = useState<Activity[]>([]);
  const [risen, setRisen] = useState<Set<string>>(() => new Set());
  if (active !== prevActive) {
    if (ready && !reducedMotion()) {
      const stopped = leavingItems(prevActive, active);
      const before = new Set(prevActive.map((a) => a.id));
      const added = active.filter((a) => !before.has(a.id)).map((a) => a.id);
      if (stopped.length > 0) setLeaving((l) => [...l, ...stopped]);
      if (added.length > 0) setRisen((r) => new Set([...r, ...added]));
    }
    setPrevActive(active);
  }
  if (!ready && !activeLoading) setReady(true);

  useEffect(() => {
    if (leaving.length === 0) return;
    const ids = new Set(leaving.map((a) => a.id));
    const t = setTimeout(() => setLeaving((l) => l.filter((a) => !ids.has(a.id))), CARD_EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const gone = leaving.filter((a) => !active.some((x) => x.id === a.id));
  // Both lists render in one flex column; `order` keeps them by start time.
  const cards = [...active, ...gone].sort((a, b) => a.startAt - b.startAt);
  const slot = new Map(cards.map((a, i) => [a.id, i]));
  const compact = active.length >= COMPACT_FROM;
  // Everything below the cards slides to its new place instead of jumping.
  const flip = useFlip([...cards.map((a) => a.id), active.length > 1 ? 'parallel' : '', String(compact)]);

  // The progress strip sits inside the category button (AMENDMENT-remove-sleep
  // 6b): each button shows today's progress against today's own target.
  const tiles = useMemo(
    () => nowTiles(todayActivities, weekTarget?.weekly ?? null, logicalWeekday(nowMinute), nowMinute),
    [todayActivities, weekTarget, nowMinute]
  );

  // "3h 20m tracked" in the header: real hours, parallel logs removed. No 24h
  // denominator anywhere - a day is not meant to be filled.
  const trackedMs = useMemo(() => {
    const actual = actualHours(todayActivities, nowMinute);
    const sum = CATEGORIES.reduce((t, c) => t + actual[c], 0);
    return Math.max(0, (sum - overlapHours(todayActivities, nowMinute)) * 3_600_000);
  }, [todayActivities, nowMinute]);


  // Today's routine (Stage 10): ticks only, not tied to hours. `today` turns at
  // 04:00 → the hook reads the new day's empty tick doc. That is the reset.
  const { groups: routineGroups } = useRoutines();
  const routine = useRoutineChecks(today);
  const routineToday = useMemo(
    () => routineForDay(routineGroups, logicalWeekday(nowMinute), routine.isChecked),
    [routineGroups, nowMinute, routine.isChecked]
  );

  // Bedtime is a mark in dayLogs, not an activity. The small header button only
  // shows tonight; the sheet is where last night can be seen and edited.
  const { tonight: bedtimeLog, lastNight } = useRecentBedtime(today);
  const [bedtimeOpen, setBedtimeOpen] = useState(false);

  // `active` sessions over 15h. `active` is a realtime stream, so this list
  // updates on mount, when the app returns to the foreground (useTick catches
  // 'focus'), and as soon as the user handles each one.
  const stale = useMemo(() => findStale(active, nowMinute), [active, nowMinute]);

  /**
   * `when.startAt === null` is the everyday path: one tap, start now.
   * `scheduled` means the record waits until its time; `promoteScheduled()` starts it.
   */
  async function handleStart(category: Category, when: StartWhen) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      // Offline: the cache already has the write, do not make the button wait for a server ack.
      const started = startActivity(uid, {
        category,
        startAt: when.startAt ?? undefined,
        status: when.scheduled ? 'scheduled' : 'active',
      });
      await capWait(started, (e) => push(`Sync failed. ${(e as Error).message}`));
      // Layer 3 of 6c: Start is one tap, so there must always be a 5-second way back.
      // `started` is kept separately because `capWait` may return before there is an id.
      const done =
        when.scheduled && when.startAt !== null
          ? `${CATEGORY_LABEL[category]} scheduled for ${clockTime(when.startAt)}`
          : `Started ${CATEGORY_LABEL[category]}`;
      push(done, {
        label: 'Undo',
        run: () => {
          void started
            .then((id) => deleteActivity(uid, id))
            .catch((e) => push(`Could not undo. ${(e as Error).message}`));
        },
      });
    } catch (e) {
      push(
        e instanceof ActivityError && e.code === 'duplicate'
          ? `${CATEGORY_LABEL[category]} is already running.`
          : `Could not start. ${(e as Error).message}`
      );
    } finally {
      setBusy(false);
    }
  }

  /** Long-press a running button = "I started at the wrong time" → open the edit sheet. */
  function editRunning(category: Category) {
    const a = active.find((x) => x.category === category);
    if (a) setSheet({ mode: 'edit', activity: a });
  }

  /** Cancel a scheduled session: hard-delete the record, with Undo since a mistap loses the plan. */
  async function handleCancelScheduled(a: Activity) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await capWait(deleteActivity(uid, a.id), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`${CATEGORY_LABEL[a.category]} cancelled.`, {
        label: 'Undo',
        run: () => {
          void startActivity(uid, {
            category: a.category,
            label: a.label,
            startAt: a.startAt,
            status: 'scheduled',
          }).catch((e) => push(`Could not undo. ${(e as Error).message}`));
        },
      });
    } catch (e) {
      push(`Could not cancel. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(id: string) {
    if (!uid || busy) return;
    // Fix the stop time AT the tap. Waiting until the user taps Save in the
    // dialog would stretch the record by exactly their hesitation.
    const at = Date.now();
    const a = active.find((x) => x.id === id);
    // Start then stop in the same minute is almost always a mistake.
    // Ask, but DO NOT block - they may really want to record it.
    if (a && at - a.startAt < 60_000) {
      setZeroStop({ id, at });
      return;
    }
    await commitStop(id, at);
  }

  async function commitStop(id: string, at: number) {
    if (!uid) return;
    setZeroStop(null);
    setBusy(true);
    try {
      await capWait(stopActivity(uid, id, at), (e) =>
        push(`Sync failed. ${(e as Error).message}`),
      );
    } catch (e) {
      push(`Could not stop. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function discardStop(id: string) {
    if (!uid) return;
    setZeroStop(null);
    setBusy(true);
    try {
      await capWait(deleteActivity(uid, id), (e) =>
        push(`Sync failed. ${(e as Error).message}`),
      );
      push('Record discarded.');
    } catch (e) {
      push(`Could not discard. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** A night's existing mark, so Undo restores it instead of clearing. */
  function bedtimeOf(date: string): number | null {
    if (date === bedtimeLog.date) return bedtimeLog.bedtimeAt;
    if (date === lastNight.date) return lastNight.bedtimeAt;
    return null;
  }

  /** Shared Undo for save and delete: rewrite the old mark if any, else delete. */
  function restoreBedtime(date: string, prev: number | null) {
    if (!uid) return;
    const back = prev === null ? clearBedtime(uid, date) : logBedtime(uid, prev);
    void back.catch((e) => push(`Could not undo. ${(e as Error).message}`));
  }

  /** Log the bedtime. `at` may be last night - the logical day comes from it. */
  async function handleBedtime(at: number) {
    if (!uid || busy) return;
    setBedtimeOpen(false);
    setBusy(true);
    const date = bedtimeDate(at);
    const prev = bedtimeOf(date);
    try {
      await capWait(logBedtime(uid, at), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(
        date === today
          ? `Bedtime ${formatBedtime(at)} logged.`
          : `Bedtime ${formatBedtime(at)} logged for ${prettyLogicalDate(date)}.`,
        { label: 'Undo', run: () => restoreBedtime(date, prev) }
      );
    } catch (e) {
      push(`Could not log bedtime. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Delete a mistaken mark. Only in the sheet - nobody deletes it by accident from the header. */
  async function handleClearBedtime(date: string) {
    if (!uid || busy) return;
    setBedtimeOpen(false);
    setBusy(true);
    const prev = bedtimeOf(date);
    try {
      await capWait(clearBedtime(uid, date), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`Bedtime cleared for ${prettyLogicalDate(date)}.`, {
        label: 'Undo',
        run: () => restoreBedtime(date, prev),
      });
    } catch (e) {
      push(`Could not clear bedtime. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function focusRunning(category: Category) {
    // Tapping a running category again: no duplicate. Scroll to its card and say
    // why, otherwise the tap looks swallowed when the card is already on screen.
    document
      .getElementById(`session-${category}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    push(`${CATEGORY_LABEL[category]} is already running.`);
  }

  return (
    // pb-20: room for the mic FAB, so it does not cover the last card's Stop button.
    <div className="flex flex-1 flex-col gap-6 pb-20">
      {/* Title and gear on top. Date, hours and bedtime share one quiet line
           below, so the gear never has to share its corner. */}
      <div className="flex flex-col">
        <TopBar>
          <h1 className="text-2xl font-semibold tracking-tight">Now</h1>
        </TopBar>
        <p className="flex min-h-11 flex-wrap items-center gap-2 text-sm tabular-nums text-ink-muted">
          <span>{prettyLogicalDate(today)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(trackedMs)} tracked</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setBedtimeOpen(true)}
            disabled={busy}
            aria-label={
              bedtimeLog.bedtimeAt
                ? `Bedtime ${formatBedtime(bedtimeLog.bedtimeAt)}, tap to edit`
                : 'Log bedtime'
            }
            className="transition hover:text-ink active:scale-95 active:text-ink disabled:opacity-50"
          >
            <MoonIcon /> {bedtimeLog.bedtimeAt ? formatBedtime(bedtimeLog.bedtimeAt) : 'bedtime'}
          </button>
        </p>
      </div>

      {reviewWeek && (
        <div className="flex items-center justify-between gap-3 border-l-2 border-line-strong py-1 pl-3">
          <p className="text-sm text-ink">Review your week</p>
          <button
            type="button"
            onClick={() => setReviewOpen(reviewWeek)}
            className="shrink-0 rounded-sm bg-ink px-3 py-1.5 text-[13px] font-medium text-[var(--surface-0)] transition active:scale-[0.98]"
          >
            Open
          </button>
        </div>
      )}

      {reviewOpen && <WeeklyReview week={reviewOpen} onClose={() => setReviewOpen(null)} />}

      {reminder ? (
        <ReminderBanner
          reminder={reminder}
          busy={busy}
          onStartLearn={() => handleStart('learn', { startAt: null, scheduled: false })}
          onDismiss={dismissReminder}
        />
      ) : (
        <BalanceBanner line={balanceLine} />
      )}

      <NextEventBanner />

      {scheduled.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Scheduled sessions">
          {scheduled.map((a) => (
            <ScheduledCard
              key={a.id}
              activity={a}
              busy={busy}
              pending={scheduledPending.has(a.id)}
              onCancel={() => handleCancelScheduled(a)}
            />
          ))}
        </section>
      ) : null}

      {/* Until we know whether a session is running, hold the space so
          CategoryGrid does not jump down when data arrives. */}
      {activeLoading && active.length === 0 ? (
        <div
          className="h-[76px] breathe rounded-md bg-zinc-100 dark:bg-zinc-900"
          aria-busy="true"
          aria-label="Loading sessions"
        />
      ) : null}

      {cards.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Running sessions">
          {active.map((a) => (
            <div
              key={a.id}
              ref={flip(a.id)}
              className={risen.has(a.id) ? 'rise' : undefined}
              style={{ order: slot.get(a.id) }}
            >
              <ActiveSessionCard
                activity={a}
                busy={busy}
                pending={pendingIds.has(a.id)}
                compact={compact}
                onStop={() => handleStop(a.id)}
                onEdit={() => setSheet({ mode: 'edit', activity: a })}
              />
            </div>
          ))}
          <StoppedCards items={gone} slot={slot} compact={compact} flip={flip} />
          {active.length > 1 ? (
            <p
              ref={flip('parallel')}
              className="text-xs text-zinc-500 dark:text-zinc-400"
              style={{ order: cards.length }}
            >
              {active.length} running in parallel · {overlap.toFixed(1)}h overlap
            </p>
          ) : null}
        </section>
      ) : null}

      {/* One box for both, so an empty routine adds no extra gap. */}
      <div ref={flip('below')} className="flex flex-col gap-6">
        <CategoryGrid
          tiles={tiles}
          running={running}
          busy={busy}
          now={nowMinute}
          onStart={handleStart}
          onFocusRunning={focusRunning}
          onEditRunning={editRunning}
        />

        <RoutineChecklist
          groups={routineToday}
          isChecked={routine.isChecked}
          onToggle={(id) =>
            void routine.toggle(id).catch((e) => push(`Could not save. ${(e as Error).message}`))
          }
        />
      </div>

      {todayActivities.length === 0 &&
      !activeLoading &&
      active.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          Nothing tracked yet. Tap a category to start.
        </p>
      ) : null}

      {zeroStop ? (
        // No onClose: the record must be saved or discarded.
        <SheetShell
          label="Less than a minute. Save anyway?"
          center
          className="w-full max-w-lg rounded-t-lg bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5"
        >
          <h3 className="mb-4 text-base font-semibold text-ink">Less than a minute. Save anyway?</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void discardStop(zeroStop.id)}
              disabled={busy}
              className="flex-1 rounded-sm border border-line py-2.5 text-sm font-medium text-ink-soft disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void commitStop(zeroStop.id, zeroStop.at)}
              disabled={busy}
              className="flex-1 rounded-sm bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </SheetShell>
      ) : null}

      {stale.length > 0 ? (
        <StaleSessionModal
          key={stale[0].id}
          activity={stale[0]}
          now={nowMinute}
          remaining={stale.length - 1}
          onResolved={() => push('Session updated.')}
        />
      ) : null}

      {/* Thinking / recording → fade slightly, still readable and clickable. */}
      {voice.thinking || voice.saving ? (
        <div
          aria-hidden="true"
          className="dim-in pointer-events-none fixed inset-0 z-30 bg-zinc-950/10 dark:bg-black/30"
        />
      ) : null}

      {/* Hide the FAB while a voice card is open - otherwise it covers Confirm/Cancel. */}
      {voiceCardOpen ? null : (
        <MicButton
          disabled={busy || voice.saving}
          thinking={voice.thinking}
          onResult={(r) => void voice.handleRecording(r, openManual)}
        />
      )}

      {voice.clarify ? (
        <VoiceSheet>
          <ClarifyCard
            question={voice.clarify.question}
            options={voice.clarify.options}
            transcript={voice.clarify.transcript}
            busy={voice.thinking || voice.saving}
            onPick={(o) => void voice.answerClarify(o, openManual)}
            onManual={() => {
              voice.cancelClarify();
              openManual();
            }}
            onCancel={voice.cancelClarify}
          />
        </VoiceSheet>
      ) : null}

      {voice.pending ? (
        <VoiceSheet>
          <ParseConfirmCard
            key={voice.pending.requestId}
            cmd={voice.pending.cmd}
            active={active}
            busy={voice.saving}
            onConfirm={voice.confirmPending}
            onCancel={voice.cancelPending}
          />
        </VoiceSheet>
      ) : null}

      {bedtimeOpen && uid ? (
        <BedtimeSheet
          tonight={bedtimeLog}
          lastNight={lastNight}
          now={nowMinute}
          busy={busy}
          onPick={(at) => void handleBedtime(at)}
          onClear={(date) => void handleClearBedtime(date)}
          onClose={() => setBedtimeOpen(false)}
        />
      ) : null}

      {sheet && uid ? (
        <RecordSheet
          target={sheet}
          uid={uid}
          now={nowMinute}
          onClose={() => setSheet(null)}
          onToast={(m) => push(m)}
          onDeleted={() => setSheet(null)}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/** Stopped sessions, shown only while they slide out. Nothing to tap. */
function StoppedCards({
  items,
  slot,
  compact,
  flip,
}: {
  items: Activity[];
  slot: Map<string, number>;
  compact: boolean;
  flip: (id: string) => (el: HTMLElement | null) => void;
}) {
  return items.map((a) => (
    <div
      key={a.id}
      ref={flip(a.id)}
      className="row-out"
      style={{ order: slot.get(a.id) }}
      aria-hidden="true"
    >
      <ActiveSessionCard activity={a} busy compact={compact} onStop={ignore} />
    </div>
  ));
}
