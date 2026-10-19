'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import DateStrip, { type DayBar } from '@/components/DateStrip';
import DayBedtimeSheet from '@/components/DayBedtimeSheet';
import RecordSheet, { restoreActivity, type SheetTarget } from '@/components/RecordSheet';
import Timeline from '@/components/Timeline';
import Toasts from '@/components/Toasts';
import MoonIcon from '@/components/MoonIcon';
import { useAuth } from '@/contexts/AuthContext';
import {
  capWait,
  useDayActivities,
  useTick,
  useToasts,
  useWeekActivities,
} from '@/hooks/useActivities';
import { actualHours, logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import { roundDown } from '@/lib/datetime';
import { dayGaps, dayWindow, layoutDay } from '@/lib/timeline';
import { daySummary, gaugeShape, type DayLine } from '@/lib/day-target';
import { useWeekTarget } from '@/hooks/useTargets';
import { bedtimeDate, logBedtime, useDayLog } from '@/hooks/useBedtime';
import { clearBedtime } from '@/lib/bedtime-store';
import { formatBedtime } from '@/lib/bedtime';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Default time for a manually added record: today → the last hour (rounded to
 * 15 minutes); a past day → 12:00–13:00 of the day being viewed.
 */
function newRecordDefaults(selected: string, today: string, now: number): SheetTarget {
  if (selected === today) {
    const end = roundDown(now, 15);
    return { mode: 'create', startAt: end - 3_600_000, endAt: end };
  }
  const [y, m, d] = selected.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  return { mode: 'create', startAt: start, endAt: start + 3_600_000 };
}

export default function HistoryPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const nowMinute = useTick(60_000, true);
  const today = logicalDate(nowMinute);

  const [selected, setSelected] = useState(() => logicalDate(Date.now()));
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const { activities, totals, overlap, loading } = useDayActivities(selected);
  const { toasts, push, dismiss } = useToasts();

  const win = useMemo(() => dayWindow(selected), [selected]);

  // --- Day strip -----------------------------------------------------------
  // The strip draws the calendar week (Mon → Sun) holding the selected day, and
  // the calendar week matches the logical week exactly - so ONE query is enough
  // (the `logicalWeek` index exists since Stage 1). The old version drew the
  // last 7 days, spanning two weeks, so it needed two queries.
  const selectedWeek = useMemo(() => logicalWeek(win.start), [win]);
  const strip = useWeekActivities(selectedWeek);

  const dayBars = useMemo(() => {
    const byDate = new Map<string, Activity[]>();
    for (const a of strip.activities) {
      const d = logicalDate(a.startAt);
      const list = byDate.get(d);
      if (list) list.push(a);
      else byDate.set(d, [a]);
    }
    const out: Record<string, DayBar[]> = {};
    for (const [d, list] of byDate) {
      // Same `actualHours()` as the summary line → the two can never disagree.
      const h = actualHours(list, nowMinute);
      const sum = CATEGORIES.reduce((acc, c) => acc + h[c], 0);
      if (sum <= 0) continue;
      // Share of that day's total logged hours, not of 24h.
      out[d] = CATEGORIES.filter((c) => h[c] > 0).map((c) => ({ c, pct: (h[c] / sum) * 100 }));
    }
    return out;
  }, [strip.activities, nowMinute]);
  // The target of the week being viewed - an old week may differ from this one.
  const { target: weekTarget } = useWeekTarget(selectedWeek);
  // Only this day's records become blocks. A session crossing midnight is not
  // cut: it shows whole on the logical day of its `startAt`.
  const { segments } = useMemo(
    () => layoutDay(activities, win, nowMinute),
    [activities, win, nowMinute],
  );
  // Gaps only count BETWEEN the first and last activity (section 6): nobody logs
  // at either end of the day, so those cannot be called "forgot to log".
  const { trackedH, gapH, gaps } = useMemo(
    () => dayGaps(segments, win, nowMinute),
    [segments, win, nowMinute],
  );

  // Hours logged on days BEFORE the viewed day, in the same logical week. This
  // feeds the catch-up suggestion: if Monday had 10h of Learn, Tuesday must know.
  //
  // Deliberately leaves out the viewed day's own hours. Adding them makes the
  // denominator shrink all day while you chase it - two looks, two targets.
  const doneBefore = useMemo(() => {
    if (strip.loading) return null;
    const out = actualHours(
      strip.activities.filter((a) => logicalDate(a.startAt) < selected),
      nowMinute,
    );
    return out;
  }, [strip.loading, strip.activities, selected, nowMinute]);

  // Compare with that day's own suggestion. The denominator is fixed at 04:00
  // and stays put all day - only the numerator moves. Today used to be pro-rated
  // by hour, so the target crept up: `0.0/0.4` at 9 am, `0.0/1.5` at 10 pm. A
  // cell that means two things on two reads is a cell nobody trusts.
  const summary = useMemo(
    () => daySummary(totals, weekTarget?.weekly ?? null, logicalWeekday(win.start), doneBefore),
    [totals, weekTarget, win, doneBefore],
  );

  // The elastic layout dropped the empty night, so there is no need to scroll
  // to 06:00 anymore. Changing day just goes back to the top.
  // Bedtime lives in `dayLogs`, not activities, so `useDayActivities` does not
  // load it - that is why History never showed the mark logged on Now.
  //
  // Keyed by LOGICAL DAY: `setBedtime` saves under `logicalDate(at)`, so 02:00
  // on Saturday night already sits on Friday. Read that exact key here, never
  // step back a day again - stepping back twice lands on Thursday.
  const { log: bedtimeLog } = useDayLog(selected);

  // --- Editing the viewed day's bedtime ----------------------------------
  // The sheet on Now only reaches the last two nights, so a mark forgotten for
  // three nights was lost. History already has the selected day - the natural
  // place to fill it in.
  const [bedtimeOpen, setBedtimeOpen] = useState(false);
  const [bedtimeBusy, setBedtimeBusy] = useState(false);

  /** Shared Undo for save and delete: restore the old mark if any, else delete. */
  function restoreBedtime(date: string, prev: number | null) {
    if (!uid) return;
    const back = prev === null ? clearBedtime(uid, date) : logBedtime(uid, prev);
    void back.catch((e) => push(`Could not undo. ${(e as Error).message}`));
  }

  /**
   * The old mark of the night about to be overwritten, so Undo restores it
   * instead of clearing. Only the VIEWED day's mark is known; `at` always falls
   * on that day, but if it does not, `null` beats restoring another night's value.
   */
  function bedtimeOf(date: string): number | null {
    return date === bedtimeLog.date ? bedtimeLog.bedtimeAt : null;
  }

  async function handleBedtime(at: number) {
    if (!uid || bedtimeBusy) return;
    setBedtimeOpen(false);
    setBedtimeBusy(true);
    const date = bedtimeDate(at);
    const prev = bedtimeOf(date);
    try {
      await capWait(logBedtime(uid, at), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`Bedtime ${formatBedtime(at)} logged for ${prettyDate(date)}.`, {
        label: 'Undo',
        run: () => restoreBedtime(date, prev),
      });
    } catch (e) {
      push(`Could not log bedtime. ${(e as Error).message}`);
    } finally {
      setBedtimeBusy(false);
    }
  }

  async function handleClearBedtime(date: string) {
    if (!uid || bedtimeBusy) return;
    setBedtimeOpen(false);
    setBedtimeBusy(true);
    const prev = bedtimeOf(date);
    try {
      await capWait(clearBedtime(uid, date), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`Bedtime cleared for ${prettyDate(date)}.`, {
        label: 'Undo',
        run: () => restoreBedtime(date, prev),
      });
    } catch (e) {
      push(`Could not clear bedtime. ${(e as Error).message}`);
    } finally {
      setBedtimeBusy(false);
    }
  }

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 });
  }, [selected]);

  return (
    <div className="flex flex-1 flex-col">
      <header
        ref={headerRef}
        className="sticky top-0 z-30 -mx-5 border-b border-zinc-100 bg-white px-5 pb-3 pt-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">History</h1>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {prettyDate(selected)}
            </p>
          </div>
          {/* Bedtime sits on the same row as the + button, NOT appended to the
              date line: that line has `truncate`, so a long "Wednesday, Sep 24"
              would cut off the time. Same text size and color token as the moon
              button on Now, so both pages read the same.
              An unlogged night still shows the button, just faint: hiding it
              would leave old days with nothing to tap to fill it in - which is
              exactly why people open History. */}
          <button
            type="button"
            onClick={() => setBedtimeOpen(true)}
            disabled={bedtimeBusy}
            aria-label={
              bedtimeLog.bedtimeAt === null
                ? `Add bedtime for ${prettyDate(selected)}`
                : `Edit bedtime for ${prettyDate(selected)}`
            }
            className={`min-h-11 shrink-0 px-1 text-xs tabular-nums transition active:scale-95 disabled:opacity-40 ${
              bedtimeLog.bedtimeAt === null
                ? 'text-zinc-300 dark:text-zinc-600'
                : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            <MoonIcon /> {bedtimeLog.bedtimeAt === null ? '–' : formatBedtime(bedtimeLog.bedtimeAt)}
          </button>
          <button
            type="button"
            onClick={() => setSheet(newRecordDefaults(selected, today, nowMinute))}
            aria-label="Add record"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-xl transition active:scale-[0.99] dark:border-zinc-700"
          >
            +
          </button>
        </div>

        <div className="mt-3">
          <DateStrip today={today} selected={selected} bars={dayBars} onSelect={setSelected} />
        </div>

        <SummaryGauge
          lines={summary}
          trackedH={trackedH}
          gapH={gapH}
          overlap={overlap}
          today={selected === today}
          planned={doneBefore !== null}
        />
      </header>

      <div ref={bodyRef} className="pt-4">
        {loading && segments.length === 0 ? (
          <p className="pb-3 text-sm text-zinc-400">Loading…</p>
        ) : (
          <Timeline
            segments={segments}
            gaps={gaps}
            win={win}
            now={nowMinute}
            onSelect={(a) => setSheet({ mode: 'edit', activity: a })}
            onAdd={() => setSheet(newRecordDefaults(selected, today, nowMinute))}
          />
        )}
      </div>

      {bedtimeOpen && uid ? (
        <DayBedtimeSheet
          // Changing day while the sheet is open rebuilds it, otherwise the time
          // field keeps the old night's value.
          key={selected}
          date={selected}
          log={bedtimeLog}
          busy={bedtimeBusy}
          onPick={(at) => void handleBedtime(at)}
          onClear={(date) => void handleClearBedtime(date)}
          onClose={() => setBedtimeOpen(false)}
        />
      ) : null}

      {sheet && uid ? (
        <RecordSheet
          key={sheet.mode === 'edit' ? sheet.activity.id : 'new'}
          target={sheet}
          uid={uid}
          now={nowMinute}
          onClose={() => setSheet(null)}
          onToast={(message) => push(message)}
          onDeleted={(a) =>
            push('Record deleted.', {
              label: 'Undo',
              run: () => {
                restoreActivity(uid, a).catch((e) => push((e as Error).message));
              },
            })
          }
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary line - `Learn 1.5 / 3.0 · Work 9.5 / 9.5`
//
// No weekTarget for that week (old data) → fall back to the old line.
// ---------------------------------------------------------------------------
function SummaryGauge({
  lines,
  trackedH,
  gapH,
  overlap,
  today,
  planned,
}: {
  lines: DayLine[];
  trackedH: number;
  gapH: number;
  overlap: number;
  /** Only when the viewed day is today is there a "how much is left". */
  today: boolean;
  /** The denominator is the catch-up suggestion, not a baseline split. */
  planned: boolean;
}) {
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  // No weekTarget for that week → daySummary returns [] - no gauges to draw,
  // so fall back to the old text line instead of an empty row.
  if (lines.length === 0) {
    return (
      <div className="mt-3 text-xs tabular-nums text-ink-soft">
        <p>
          {h(trackedH)}h logged{gapH > 0 ? ` · ${h(gapH)}h gaps` : ''}
        </p>
        {overlap > 0 ? <p className="mt-0.5 text-ink-muted">{h(overlap)}h overlap</p> : null}
      </div>
    );
  }

  const by = new Map(lines.map((l) => [l.category, l]));

  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((c) => (
          <Gauge
            key={c}
            today={today}
            line={
              by.get(c) ?? {
                category: c,
                actual: 0,
                target: 0,
                standard: 0,
                met: false,
                capped: false,
                low: false,
              }
            }
          />
        ))}
      </div>
      {/* Say once what the denominator is. Without this line the number changes
          daily and nobody knows why - it looks like a bug. */}
      {planned ? (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
          Daily target = hours left ÷ days left.
        </p>
      ) : null}
      {overlap > 0 ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">{h(overlap)}h overlap</p>
      ) : null}
    </div>
  );
}

/** One gauge cell: label / bar / number / note. The bar is 6px tall, no border. */
function Gauge({ line, today }: { line: DayLine; today: boolean }) {
  const { category: c, actual, target, met, capped } = line;
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  const { fill, over, noTarget, dim } = gaugeShape(actual, target);

  // The bottom line. Priority: week done → still short today → capped.
  // It always reserves its height, or the 4 columns would not line up.
  const left = target - actual;
  const note = met
    ? 'week done'
    : today && !noTarget && left > 0.05
      ? `${h(left)}h left`
      : capped
        ? 'at cap'
        : '';

  return (
    <div className={`min-w-0 ${dim ? 'opacity-40' : ''}`}>
      <p className="truncate text-[10px] tracking-[-0.01em] text-ink-soft">{CATEGORY_LABEL[c]}</p>

      {noTarget ? (
        // "no bar" - still reserves the same height so the 4 columns line up.
        <div className="mt-1 h-1.5" aria-hidden="true" />
      ) : (
        <div
          className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-line"
          role="img"
          aria-label={`${CATEGORY_LABEL[c]} ${h(actual)} of ${h(target)} hours`}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${fill * 100}%`, backgroundColor: CATEGORY_COLOR[c] }}
          />
          {/* Over target: a strong ink tick at the right edge. Never recolor the
              whole bar - going over on Learn is good, do not paint it red. */}
          {over ? <span className="absolute inset-y-0 right-0 w-[3px] bg-ink" /> : null}
        </div>
      )}

      {/* The number also says where you stand against the plan, no need to read
          the bar closely: nothing logged → gray; over plan → bold (with the ink
          tick at the bar's edge); short → normal. Gray only, per DESIGN.md. */}
      <p className="mt-1 truncate text-[11px] tabular-nums">
        <span
          className={
            actual <= 0
              ? 'text-ink-muted'
              : over
                ? 'font-semibold text-ink'
                : 'text-ink'
          }
        >
          {h(actual)}
        </span>
        <span className="text-ink-muted">/{noTarget ? '-' : h(target)}</span>
      </p>

      {/* Always takes space, even empty - the 4 columns must line up at the bottom. */}
      <p className="mt-0.5 h-3.5 truncate text-[10px] tabular-nums text-ink-muted">{note}</p>
    </div>
  );
}
