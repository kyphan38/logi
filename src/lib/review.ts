// ============================================================
// logi - Weekly Review (Stage 6 Task 1)
//
// Closes the loop: look back at the past week → pick next week's preset.
//
// Pure file: no React, no Firestore. Tested with `node --test`.
// All numbers go through Stage 5's range-target.ts - NEVER recomputed here,
// since `expectedHours()` pro-rates by the running week, and using it for a
// finished week is wrong (it takes the NEW week's weekday).
// ============================================================

import {
  crunchStreak,
  dayProgress,
  logicalDate,
  logicalWeek,
  logicalWeekday,
  weekendConflict,
} from '@/lib/balance';
import { isThin, logQuality, type LogQuality } from '@/lib/log-quality';
import type { Range } from '@/lib/range';
import { rangeLabel } from '@/lib/range';
import {
  actualForRange,
  deviationsForRange,
  expectedForRange,
  type RangeDeviation,
} from '@/lib/range-target';
import { buildWeekly, type DebtBalance, type Weekly } from '@/lib/rollover';
import { addDays, dayWindow } from '@/lib/timeline';
import { addWeeks, weekStart } from '@/lib/week';
import {
  CATEGORY_LABEL,
  PRESETS,
  type Activity,
  type Category,
  type PresetId,
} from '@/types/logi';

// ------------------------------------------------------------
// Trigger
// ------------------------------------------------------------

/** Sunday 19:00 logical time. */
export const REVIEW_HOUR = 19;

/**
 * Missed Sunday evening, Monday and Tuesday are still open.
 * Without this window, skipping one week loses it - and a busy week (the one
 * most worth reviewing) is exactly the easiest to forget.
 */
export const GRACE_WEEKDAY_MAX = 2; // 1 = T2, 2 = T3

function markAt(date: string, hour: number): number {
  return dayWindow(date).start + (hour - 4) * 3_600_000;
}

/**
 * The week needing review, or null.
 * `isReviewed` checks the flag in `meta/reviews` - once reviewed it never shows again.
 */
export function reviewDueWeek(
  now: number,
  isReviewed: (week: string) => boolean
): string | null {
  const current = logicalWeek(now);
  const dow = logicalWeekday(now); // 0 = CN

  if (dow === 0 && now >= markAt(logicalDate(now), REVIEW_HOUR)) {
    return isReviewed(current) ? null : current;
  }
  if (dow >= 1 && dow <= GRACE_WEEKDAY_MAX) {
    const prev = addWeeks(current, -1);
    return isReviewed(prev) ? null : prev;
  }
  return null;
}

// ------------------------------------------------------------
// Screen 1 - the week's numbers
// ------------------------------------------------------------

/**
 * The logical day range of an ISO week.
 * `isPartial` is only on when today is that week's Sunday and the day is not
 * over - exactly when the 19:00 banner fires. So Sunday's target is pro-rated,
 * not reported 8h short just because 5 hours of the day remain.
 */
export function weekRange(week: string, now: number = Date.now()): Range {
  const from = logicalDate(weekStart(week));
  const to = addDays(from, 6);
  return {
    from,
    to,
    kind: 'custom',
    isPartial: to === logicalDate(now) && dayProgress(now) < 1,
  };
}

export interface ReviewInput {
  week: string;
  /** That week's records (already filtered by logicalWeek). */
  activities: Activity[];
  /** key = logicalWeek. A missing week makes range-target fall back to PRESETS.normal. */
  weekTargets: Map<string, Weekly>;
  /** Preset history for the streak - by week, ascending. */
  history: { preset: PresetId }[];
  now: number;
}

export interface ReviewSummary {
  week: string;
  /** "Week 35 · Aug 24 – Aug 30" */
  title: string;
  range: Range;
  rows: RangeDeviation[];
  quality: LogQuality;
  /** At most two lines. */
  notes: string[];
}

const h1 = (n: number) => `${Math.round(n * 10) / 10}h`;

export function reviewTitle(week: string, range: Range): string {
  const n = Number(week.slice(-2));
  return `Week ${n} · ${rangeLabel(range)}`;
}

export function buildReview(input: ReviewInput): ReviewSummary {
  const { week, activities, weekTargets, history, now } = input;
  const range = weekRange(week, now);

  const actual = actualForRange(activities, range, now);
  const expected = expectedForRange(range, weekTargets, now);
  const rows = deviationsForRange(actual, expected);
  const quality = logQuality(activities, range, now);

  return {
    week,
    title: reviewTitle(week, range),
    range,
    rows,
    quality,
    notes: pickNotes({ activities, rows, quality, weekTargets, week, history, now }),
  };
}

// ------------------------------------------------------------
// Screen 2 - worth noticing
// ------------------------------------------------------------

export interface NoteInput {
  activities: Activity[];
  rows: RangeDeviation[];
  quality: LogQuality;
  weekTargets: Map<string, Weekly>;
  week: string;
  history: { preset: PresetId }[];
  now: number;
}

/** Nothing worth saying is a result too - do not invent something to say. */
export const BALANCED = 'A balanced week.';

/**
 * At most two lines, in the plan's exact priority order.
 * State numbers, no advice.
 */
export function pickNotes(input: NoteInput): string[] {
  const { activities, rows, quality, weekTargets, week, history } = input;
  const out: string[] = [];

  // 1. Weekend OT eating study time - the most worth saying.
  const target = weekTargets.get(week) ?? PRESETS.normal.weekly;
  const conflict = weekendConflict(activities, target, input.now);
  if (conflict) out.push(conflict);

  // 2. The largest gap in absolute hours. Only ones past the double deadband.
  const worst = rows
    .filter((r) => r.flag !== 'ok')
    .sort((a, b) => Math.abs(b.deltaHours) - Math.abs(a.deltaHours))[0];
  if (worst && out.length < 2) {
    const sign = worst.deltaHours > 0 ? '+' : '−';
    out.push(
      `${CATEGORY_LABEL[worst.category]} ${h1(worst.actual)} / ${h1(worst.expected)} · ` +
        `${sign}${Math.abs(Math.round(worst.deltaPct * 100))}%`
    );
  }

  // 3. Very sparse logs make the numbers above untrustworthy - say so.
  if (isThin(quality) && out.length < 2) {
    out.push(`Only ${quality.loggedDays} of ${quality.totalDays} days are logged well enough.`);
  }

  // 4. Repeated Crunch signals a wrong baseline, not a busy week.
  const streak = crunchStreak(history);
  if (streak.count >= 4 && out.length < 2) {
    out.push(`Crunch: ${streak.count} of the last ${streak.of} weeks.`);
  }

  return out.length > 0 ? out.slice(0, 2) : [BALANCED];
}

// ------------------------------------------------------------
// Screen 3 - next week
// ------------------------------------------------------------

export interface NextWeekPlan {
  week: string;
  preset: PresetId;
  weekly: Weekly;
  /** Debt to be added to next week's target. */
  applied: DebtBalance;
  remaining: DebtBalance;
  /** "Carrying over: Learn +6.0h debt" - empty when nothing is owed. */
  debtNote: string;
}

/**
 * Preview of next week. Pure - nothing is saved yet.
 * Uses rollover.ts's `buildWeekly()` so the numbers are exactly what rollover
 * will create, not a second calculation running alongside.
 */
export function planNextWeek(
  week: string,
  presetId: PresetId,
  debt: DebtBalance
): NextWeekPlan {
  const next = addWeeks(week, 1);
  const { weekly, applied, remaining } = buildWeekly(PRESETS[presetId].weekly, debt);

  const parts = (Object.entries(applied) as [Category, number][])
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${CATEGORY_LABEL[c]} +${h1(v)}`);

  return {
    week: next,
    preset: presetId,
    weekly,
    applied,
    remaining,
    debtNote: parts.length > 0 ? `Carrying over: ${parts.join(', ')} debt` : '',
  };
}

/** A past week is view-only. A past preset cannot be changed. */
export function canSetNextWeek(week: string, now: number = Date.now()): boolean {
  return addWeeks(week, 1) >= logicalWeek(now);
}
