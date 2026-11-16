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
import VoiceBatchCard from '@/components/VoiceBatchCard';
import ReminderBanner from '@/components/ReminderBanner';
import RecordSheet, { type SheetTarget } from '@/components/RecordSheet';
import ScheduledCard from '@/components/ScheduledCard';
import SheetShell from '@/components/SheetShell';
import RoutineChecklist from '@/components/RoutineChecklist';
import RoutineDueSheet from '@/components/RoutineDueSheet';
import Toasts from '@/components/Toasts';
import VoiceSheet from '@/components/VoiceSheet';
import WeeklyReview from '@/components/WeeklyReview';
import MoonIcon from '@/components/MoonIcon';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/contexts/AuthContext';
import {
  useActiveActivities,
  useDayActivities,
  useScheduledActivities,
  useWeekActivities,
} from '@/hooks/useActivities';
import { useTick } from '@/hooks/useTick';
import { useToasts } from '@/hooks/useToasts';
import { useRecentBedtime } from '@/hooks/useBedtime';
import { useReminders } from '@/hooks/useReminders';
import { useReviewDue } from '@/hooks/useReview';
import { useFlip } from '@/hooks/useFlip';
import { useCurrentWeek, useRollover, useWeekTarget } from '@/hooks/useTargets';
import { useRoutineChecks, useRoutines } from '@/hooks/useRoutine';
import { useLeavingCards } from '@/hooks/useLeavingCards';
import { useNowActions } from '@/hooks/useNowActions';
import { useVoice } from '@/hooks/useVoice';
import { actualHours, findStale, logicalDate, logicalWeekday, overlapHours } from '@/lib/balance';
import { pickBalance } from '@/lib/banner';
import { formatBedtime } from '@/lib/bedtime';
import { formatDuration, prettyDay, roundDown } from '@/lib/datetime';
import { nowTiles } from '@/lib/day-progress';
import { routineForDay } from '@/lib/routine';
import { CATEGORIES } from '@/types/logi';
import { btn } from '@/lib/ui';
import StoppedCards from '@/components/now/StoppedCards';

/** From 3 parallel sessions up, cards collapse so Now still fits one screen. */
const COMPACT_FROM = 3;

export default function NowPage() {
  const { uid } = useAuth();

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
  const [sheet, setSheet] = useState<SheetTarget | null>(null);

  const voice = useVoice(uid, active, push);

  // While the voice card is open, the FAB steps aside.
  const voiceCardOpen = voice.pending !== null || voice.clarify !== null || voice.batch !== null;

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

  const { cards, gone, slot, risen } = useLeavingCards(active, activeLoading);
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
  const routineRunning = useMemo(
    () => new Set(active.flatMap((a) => (a.routineItemId ? [a.routineItemId] : []))),
    [active]
  );

  // A routine session past its planned length asks "Done?". The 60s tick
  // would ask up to a minute late, so one timer fires at the next due time.
  const nextDue = useMemo(() => {
    const due = active.flatMap((a) => (a.dueAt != null ? [a.dueAt] : []));
    return due.length > 0 ? Math.min(...due) : null;
  }, [active]);
  const [dueClock, setDueClock] = useState(0);
  useEffect(() => {
    if (nextDue === null) return;
    const t = setTimeout(() => setDueClock(Date.now()), Math.max(0, nextDue - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [nextDue]);
  const clock = Math.max(nowMinute, dueClock);
  const dueSession = active.find((a) => a.dueAt != null && a.dueAt <= clock) ?? null;

  // Bedtime is a mark in dayLogs, not an activity. The small header button only
  // shows tonight; the sheet is where last night can be seen and edited.
  const { tonight: bedtimeLog, lastNight } = useRecentBedtime(today);
  const [bedtimeOpen, setBedtimeOpen] = useState(false);

  const {
    busy,
    zeroStop,
    handleStart,
    handleStartRoutine,
    handleRoutineDone,
    handleRoutineMore,
    editRunning,
    handleCancelScheduled,
    handleStop,
    commitStop,
    discardStop,
    handleBedtime,
    handleClearBedtime,
    focusRunning,
  } = useNowActions({
    uid,
    active,
    push,
    routine,
    setSheet,
    today,
    bedtimeLog,
    lastNight,
    setBedtimeOpen,
  });

  // `active` sessions over 15h. `active` is a realtime stream, so this list
  // updates on mount, when the app returns to the foreground (useTick catches
  // 'focus'), and as soon as the user handles each one.
  const stale = useMemo(() => findStale(active, nowMinute), [active, nowMinute]);

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
          <span>{prettyDay(today)}</span>
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
            className={`${btn('primary', 'sm')} shrink-0`}
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
          className="h-[76px] breathe rounded-md bg-surface-1"
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
              className="text-xs text-ink-muted"
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
          runningIds={routineRunning}
          busy={busy}
          onStart={handleStartRoutine}
        />
      </div>

      {todayActivities.length === 0 &&
      !activeLoading &&
      active.length === 0 ? (
        <p className="text-sm text-ink-muted">
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
              className={`${btn('secondary')} flex-1`}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void commitStop(zeroStop.id, zeroStop.at)}
              disabled={busy}
              className={`${btn('primary')} flex-1`}
            >
              Save
            </button>
          </div>
        </SheetShell>
      ) : null}

      {dueSession && !zeroStop && stale.length === 0 ? (
        <RoutineDueSheet
          key={`${dueSession.id}-${dueSession.dueAt}`}
          activity={dueSession}
          busy={busy}
          onDone={() => void handleRoutineDone(dueSession)}
          onMore={(m) => void handleRoutineMore(dueSession, m)}
        />
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
          className="dim-in pointer-events-none fixed inset-0 z-30 bg-black/10 dark:bg-black/30"
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

      {voice.batch ? (
        <VoiceSheet>
          <VoiceBatchCard
            key={voice.batch.requestId}
            items={voice.batch.items}
            now={nowMinute}
            busy={voice.saving}
            onSave={(idx) => void voice.saveBatch(idx)}
            onCancel={voice.cancelBatch}
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
