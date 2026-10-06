// ---------------------------------------------------------------------------
// logi - Trend: ONE category across consecutive periods
//
// Unlike `bucket.ts`: there columns are cut from the range on screen. Here the
// window is built back from today, NOT tied to the range picker - "has Learn
// gone up or down these weeks" has nothing to do with the viewed range.
//
// The last period is always the RUNNING one, marked `partial`: if this week is
// only at Wednesday, a low bar is expected, not a trend.
//
// Pure file: no React, no Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { daysBetween, weekOf, type Range } from '@/lib/range';
import { addDays } from '@/lib/timeline';
import { addWeeks, weekLabel, weekStart } from '@/lib/week';

export type TrendSpan = '6w' | '12w' | '26w';

// Short labels so the chips fit one row at 375px. Dropping "Last" keeps the
// meaning: "12 weeks" still reads as the last 12 weeks.
//
// No MONTH spans anymore. Months have 4 or 5 weeks, so long months naturally
// stand taller - that is the calendar, not a trend. The whole app runs on
// weeks (weekTargets, WeeklyReview, the 89h/week budget), so trends count in
// weeks too, to keep columns comparable.
export const TREND_SPANS: readonly { value: TrendSpan; label: string }[] = [
  { value: '6w', label: '6 weeks' },
  { value: '12w', label: '12 weeks' },
  { value: '26w', label: '26 weeks' },
];

export const DEFAULT_SPAN: TrendSpan = '6w';

/** `'12w'` → `12`. */
export function spanWeeks(span: TrendSpan): number {
  return Number(span.slice(0, -1));
}

export interface TrendBucket {
  /** A stable key for React/Recharts: "2026-W35". */
  key: string;
  /** X-axis label: "W35". */
  label: string;
  range: Range;
  /** An unfinished period - a low bar does not mean little was done. */
  partial: boolean;
}

/**
 * A span's columns, old → new. The last column is the running period.
 *
 * The running period stops TODAY, not at the end of the week: future days
 * have no data while the target still counts in full → the bar would look short.
 */
export function trendBuckets(span: TrendSpan, now: number = Date.now()): TrendBucket[] {
  const today = logicalDate(now);
  const count = spanWeeks(span);
  const current = weekOf(today);
  const out: TrendBucket[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const w = addWeeks(current, -i);
    const from = logicalDate(weekStart(w));
    const last = addDays(from, 6);
    const partial = i === 0;
    out.push({
      key: w,
      label: weekLabel(w),
      range: { from, to: partial ? today : last, kind: 'custom', isPartial: partial },
      partial,
    });
  }
  return out;
}

/** The window covering the whole span - ONE query for every column. */
export function trendWindow(buckets: TrendBucket[]): { from: string; to: string } {
  return { from: buckets[0].range.from, to: buckets[buckets.length - 1].range.to };
}

/**
 * How much of the running period has passed, 0..1.
 * Used to say "this week is only 3/7 through", never to scale the bar up -
 * extrapolating is making numbers up.
 */
export function elapsedFraction(b: TrendBucket, now: number = Date.now()): number {
  if (!b.partial) return 1;
  return Math.min(1, daysBetween(b.range.from, logicalDate(now)) / 7);
}

// ---------------------------------------------------------------------------
// An empty period ≠ a zero period
//
// Before Stage 8, weeks before using the app were drawn as 0 bars and fed into
// the comparison, so the chart read "W31 0.0h → W35 7.3h · up +7.3h". That
// person did not study 0 hours in W31 - the app did not exist yet. Same bug as
// `sampleSize < 3` in AI insights: missing data is not zero data.
// ---------------------------------------------------------------------------

/** Only the fields that decide "did anyone log anything this period". */
interface Logged {
  status: string;
  startAt: number;
}

/**
 * Whether the period has at least one REAL session.
 *
 * `abandoned` sessions were dropped, so they are not data; `scheduled` ones
 * have not happened. Counting either, one missed booking would turn an empty
 * week into "has data, 0 hours" - exactly the wrong bar being removed.
 */
export function hasLogged(
  activities: readonly Logged[],
  range: { from: string; to: string }
): boolean {
  return activities.some((a) => {
    if (a.status === 'abandoned' || a.status === 'scheduled') return false;
    const d = logicalDate(a.startAt);
    return d >= range.from && d <= range.to;
  });
}

export interface TrendPoint {
  label: string;
  /** `null` = no data for the period. No bar drawn, not compared. */
  hours: number | null;
  /** The running period - the bar is low because the period is not over. */
  partial: boolean;
}

export interface TrendCompare {
  from: TrendPoint;
  to: TrendPoint;
  /** Positive = going up. */
  diff: number;
  word: 'up' | 'down' | 'flat';
}

/**
 * The first ↔ last comparison line, or `null` without enough basis.
 *
 * Drops the unfinished and empty periods. Under 2 usable periods the line is
 * hidden entirely - silence beats a trend built from one point.
 *
 * `flatBelow` is the "no change" threshold, in the same unit as `hours`.
 * Default 0.5 (hours). For percentage points the caller passes 5 - a 5-point
 * drift over many weeks is noise, not a change.
 */
export function trendCompare(
  points: readonly TrendPoint[],
  flatBelow = 0.5
): TrendCompare | null {
  const usable = points.filter((p) => !p.partial && p.hours !== null);
  if (usable.length < 2) return null;

  const from = usable[0];
  const to = usable[usable.length - 1];
  const diff = (to.hours as number) - (from.hours as number);
  return {
    from,
    to,
    diff,
    word: Math.abs(diff) < flatBelow ? 'flat' : diff > 0 ? 'up' : 'down',
  };
}

// ---------------------------------------------------------------------------
// Trimming empty periods at the START
//
// "26 weeks" means AT MOST 26 weeks. A new account with 3 weeks of data drawn
// as 26 cells has 23 dead cells up front - the chart looks broken. With the
// start trimmed, chips no longer depend on account age: 26w gives 3 columns
// today and fills up over the months.
//
// ONLY trim the start. Empty weeks in the MIDDLE stay - those are weeks you
// really took off; that is information, not waste.
// ---------------------------------------------------------------------------

/**
 * Minimum column count. A 1-column chart looks like a render bug, not data;
 * 3 columns is the least for the eye to see a shape.
 */
export const MIN_TREND_BUCKETS = 3;

/**
 * Drops empty periods at the start of the array. No period with data → `[]`
 * (the caller shows its own empty state).
 *
 * If trimming leaves fewer than `MIN_TREND_BUCKETS`, give some back to reach
 * the floor: the extra empty cells are real weeks, empty is right.
 */
export function trimLeadingEmpty<T>(buckets: readonly T[], hasData: (b: T) => boolean): T[] {
  const first = buckets.findIndex(hasData);
  if (first === -1) return [];
  const start = Math.min(first, Math.max(0, buckets.length - MIN_TREND_BUCKETS));
  return buckets.slice(start);
}

// ---------------------------------------------------------------------------
// Bar or line
//
// Bars answer "more or less than target" but at 375px only look good up to
// ~13 columns; beyond that bars get thin and X labels overlap. A line answers
// "going up or down" and handles many points - the switch depends on COLUMN
// COUNT, not span, since the span is trimmed and its name does not tell the count.
// ---------------------------------------------------------------------------

export const MAX_BARS = 13;

export function chartKind(bucketCount: number): 'bars' | 'line' {
  return bucketCount > MAX_BARS ? 'line' : 'bars';
}

/**
 * X-axis labels thin out with many columns: 1 label per 4 columns. Returns the
 * value for Recharts XAxis's `interval` prop (0 = show all, 3 = skip 3 show 1).
 */
export function labelInterval(bucketCount: number): number {
  return bucketCount > MAX_BARS ? 3 : 0;
}

/**
 * Percent of that same period's target. `null` when the period has no data or
 * the target is 0 - dividing by 0 gives Infinity, and "no target set" is not
 * "missed target".
 *
 * Long spans plot ratios, not hours: over 26 weeks the target may change many
 * times, an hours line would wobble, while the 100% mark stays put.
 */
export function onTrackPct(actual: number | null, expected: number): number | null {
  if (actual === null || expected <= 0) return null;
  return (actual / expected) * 100;
}
