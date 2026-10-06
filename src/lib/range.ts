// ---------------------------------------------------------------------------
// logi - Time ranges for Analytics (Stage 5 Task 1)
//
// Pure file: no React, no Firestore → tested with `node --test`.
//
// Every date goes through `logicalDate()` (04:00 cut). "Today" at 02:00 is the
// PREVIOUS day - with raw calendar dates every number after midnight is wrong.
// ---------------------------------------------------------------------------
import { dayProgress, logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import { addDays } from '@/lib/timeline';
import { addWeeks, weekStart } from '@/lib/week';

/**
 * `today` is gone (AMENDMENT-remove-sleep section 8.1): Analytics only answers
 * questions that need 2+ days. For one day, Now and History do better - a
 * one-column By day is pointless, When duplicates History, Balance duplicates
 * the buttons on Now. One day can still be picked via `custom`, showing only Balance.
 */
export type RangeKind = 'this_week' | 'last_week' | 'this_month' | 'custom';

export interface Range {
  /** logicalDate, "2026-08-24". */
  from: string;
  /** logicalDate, inclusive. */
  to: string;
  kind: RangeKind;
  /**
   * `to` is today and the day is not over.
   * This flag decides whether the target is pro-rated. Without it, "This week"
   * on a Tuesday would always report everything short.
   */
  isPartial: boolean;
}

/** Blocked beyond this - a heavy query, and an unreadable chart. */
export const MAX_RANGE_DAYS = 92;

export const RANGE_TOO_LARGE = 'Range too large - max 3 months.';

/** The most weeks a `logicalWeek in [...]` query can take (Firestore allows 30). */
export const MAX_WEEKS_IN_QUERY = 4;

// ---------------------------------------------------------------------------
// Logical day ↔ timestamp conversion
// ---------------------------------------------------------------------------

/**
 * 12:00 noon of a logical day.
 * Mid-day on purpose, not 00:00: midnight belongs to the PREVIOUS logical day.
 */
export function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** Logical day → its ISO week. */
export function weekOf(date: string): string {
  return logicalWeek(noonOf(date));
}

/** Logical day → weekday. 0 = Sun … 6 = Sat. */
export function weekdayOf(date: string): number {
  return logicalWeekday(noonOf(date));
}

/** Days from `from` to `to`, both ends included. `to` before `from` → 0. */
export function daysBetween(from: string, to: string): number {
  const ms = noonOf(to) - noonOf(from);
  if (ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

/** Logical days in the range, sorted ascending. */
export function daysOf(range: { from: string; to: string }): string[] {
  const out: string[] = [];
  const n = daysBetween(range.from, range.to);
  for (let i = 0; i < n; i++) out.push(addDays(range.from, i));
  return out;
}

/** Logical weeks the range touches, unique, in order. */
export function weeksOf(range: { from: string; to: string }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Walk by week, not by day: a 92-day range takes only ~14 loops.
  let w = weekOf(range.from);
  const last = weekOf(range.to);
  for (let guard = 0; guard < 100; guard++) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (w === last) break;
    w = addWeeks(w, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Building a range from a chip
// ---------------------------------------------------------------------------

/** Monday of the logical week holding `date`. */
export function mondayOf(date: string): string {
  return logicalDate(weekStart(weekOf(date)));
}

function partial(to: string, now: number): boolean {
  return to === logicalDate(now) && dayProgress(now) < 1;
}

/**
 * Chip → a concrete range.
 *
 * `this_week` and `this_month` end TODAY, not at the end of the week/month:
 * future days have no data while the target still counts in full → the chart
 * would falsely report shortfalls every Tuesday.
 */
export function buildRange(kind: Exclude<RangeKind, 'custom'>, now: number = Date.now()): Range {
  const today = logicalDate(now);

  switch (kind) {
    case 'this_week': {
      const from = mondayOf(today);
      return { from, to: today, kind, isPartial: partial(today, now) };
    }

    case 'last_week': {
      const w = addWeeks(weekOf(today), -1);
      const from = logicalDate(weekStart(w));
      // Last week is always closed → never pro-rated.
      return { from, to: addDays(from, 6), kind, isPartial: false };
    }

    case 'this_month': {
      const from = `${today.slice(0, 7)}-01`;
      return { from, to: today, kind, isPartial: partial(today, now) };
    }
  }
}

export interface CustomResult {
  range: Range | null;
  /** An error message to show directly in the UI. `null` means valid. */
  error: string | null;
}

/** A user-picked range. Swaps itself if reversed, blocked when too long. */
export function customRange(from: string, to: string, now: number = Date.now()): CustomResult {
  if (!from || !to) return { range: null, error: 'Pick both dates.' };

  // Reversed picks are fixed quietly, not an error - the user just tapped in the wrong order.
  const [a, b] = noonOf(from) <= noonOf(to) ? [from, to] : [to, from];

  if (daysBetween(a, b) > MAX_RANGE_DAYS) return { range: null, error: RANGE_TOO_LARGE };

  return {
    range: { from: a, to: b, kind: 'custom', isPartial: partial(b, now) },
    error: null,
  };
}

/** `Last 7 days` / `Last 30 days` - n days including today. */
export function lastNDays(n: number, now: number = Date.now()): Range {
  const today = logicalDate(now);
  return {
    from: addDays(today, -(n - 1)),
    to: today,
    kind: 'custom',
    isPartial: partial(today, now),
  };
}

// ---------------------------------------------------------------------------
// Query strategy - ONE query for the whole range
// ---------------------------------------------------------------------------

export type QueryPlan =
  | { mode: 'weeks'; weeks: string[] }
  | { mode: 'dates'; from: string; to: string };

/**
 * A range within 1–4 weeks → `logicalWeek in [...]` (uses an existing index,
 * and shares cache with other screens). Longer → a range on `logicalDate`.
 *
 * Never one query per day.
 */
export function queryPlan(range: { from: string; to: string }): QueryPlan {
  const weeks = weeksOf(range);
  if (weeks.length <= MAX_WEEKS_IN_QUERY) return { mode: 'weeks', weeks };
  return { mode: 'dates', from: range.from, to: range.to };
}

/** Week queries over-fetch at both ends → filter again by logical day. */
export function inRange(logicalDateOf: string, range: { from: string; to: string }): boolean {
  return logicalDateOf >= range.from && logicalDateOf <= range.to;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const CHIP_LABEL: Record<RangeKind, string> = {
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  custom: 'Custom',
};

export function chipLabel(kind: RangeKind): string {
  return CHIP_LABEL[kind];
}

function pretty(date: string): string {
  return new Date(noonOf(date)).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** "Aug 24 – Aug 26" · a single day is just "Aug 26". */
export function rangeLabel(range: { from: string; to: string }): string {
  return range.from === range.to ? pretty(range.from) : `${pretty(range.from)} – ${pretty(range.to)}`;
}
