// ---------------------------------------------------------------------------
// logi - Target & actual hours for ANY RANGE (Stage 5 Task 2)
//
// The easiest part of Stage 5 to get wrong. Three traps:
//
//  1. `weekly × days / 7` is WRONG. Targets are not even - Tuesday Work is
//     9.5h while Sunday is 0h. Monday→Friday on the Normal preset gives Work
//     43h; an even split gives 30.7h. 12h off, enough to make every conclusion junk.
//  2. Each week has its own target. Last week may be Crunch, this week Normal.
//     A range spanning two weeks must read EACH week's target.
//  3. Only today is pro-rated, and only when `isPartial`. Past days always
//     count the full target.
//
// A range's log quality lives in `@/lib/log-quality`, not here.
// Pure file: no React, no Firestore.
// ---------------------------------------------------------------------------
import {
  DEV_ABS_THRESHOLD,
  DEV_PCT_THRESHOLD,
  dayProgress,
  logicalDate,
  PRESETS,
} from '@/lib/balance';
import { dailyTargetFor } from '@/lib/day-target';
import { daysOf, weekOf, weekdayOf, type Range } from '@/lib/range';
import { dayWindow } from '@/lib/timeline';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

const H_MS = 3_600_000;

function zero(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
}

/**
 * Expected target for the whole range, summed BY CALENDAR.
 *
 * @param weekTargets key = logicalWeek ("2026-W35"). A week missing from the map
 *   falls back to `PRESETS.normal` - no target set does not mean target = 0.
 */
export function expectedForRange(
  range: Range,
  weekTargets: Map<string, Record<Category, number>>,
  now: number = Date.now()
): Record<Category, number> {
  const out = zero();
  const today = logicalDate(now);
  const frac = dayProgress(now);

  // Many days share one week → remember the built target instead of 92 map lookups.
  const cache = new Map<string, Record<Category, number>>();

  for (const d of daysOf(range)) {
    const w = weekOf(d);
    let weekly = cache.get(w);
    if (!weekly) {
      weekly = weekTargets.get(w) ?? PRESETS.normal.weekly;
      cache.set(w, weekly);
    }

    const daily = dailyTargetFor(weekdayOf(d), weekly);
    // Past days: always full. Today: only cut when the range is unfinished.
    const scale = range.isPartial && d === today ? frac : 1;

    for (const c of CATEGORIES) out[c] += daily[c] * scale;
  }

  return out;
}

/**
 * The union of logged spans, clipped to the range window.
 * Union instead of "sum minus overlap", so overlapping hours count once,
 * even when three sessions overlap at the same time.
 */
function loggedHours(activities: Activity[], range: Range, now: number): number {
  const winStart = dayWindow(range.from).start;
  const winEnd = Math.min(dayWindow(range.to).end, now);
  if (winEnd <= winStart) return 0;

  const iv: [number, number][] = [];
  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const s = Math.max(a.startAt, winStart);
    const e = Math.min(a.endAt ?? now, winEnd);
    if (e > s) iv.push([s, e]);
  }
  iv.sort((x, y) => x[0] - y[0]);

  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of iv) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;

  return total / H_MS;
}

/**
 * Hours logged per category, assigning WHOLE sessions to the `logicalDate` of
 * `startAt` (AMENDMENT-remove-sleep section 7).
 *
 * The old version cut sessions at the range edges. For By day's one-day
 * columns, a 22:00 → 01:00 session was split across two columns: the weekly
 * total was right but each day was wrong, and no column matched Balance. Now
 * there is no cut, so the Y axis can exceed 24h on a day with a session
 * crossing midnight - as the note at the top of `StackedDays` says.
 *
 * Only the heatmap uses real clock hours.
 *
 * Within one category, overlapping hours STILL count twice - that is
 * `overlapForRange`'s job, not this bar's.
 */
export function actualForRange(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): Record<Category, number> {
  const out = zero();

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const d = logicalDate(a.startAt);
    if (d < range.from || d > range.to) continue;
    const e = a.endAt ?? now;
    if (e > a.startAt) out[a.category] += (e - a.startAt) / H_MS;
  }

  return out;
}

/**
 * Like balance.ts's `Deviation` without `weeklyTarget` - a range may span weeks
 * with different targets, so "weekly target" means nothing.
 */
export interface RangeDeviation {
  category: Category;
  actual: number;
  expected: number;
  deltaHours: number;
  deltaPct: number;
  flag: 'over' | 'under' | 'ok';
}

/**
 * Compares actual with expected, using balance.ts's EXACT double deadband:
 * only flag when off by > 25% AND >= 2h.
 *
 * Cannot reuse `deviations()`, since it computes expected for the current
 * week itself; here expected comes from `expectedForRange`.
 */
export function deviationsForRange(
  actual: Record<Category, number>,
  expected: Record<Category, number>
): RangeDeviation[] {
  return CATEGORIES.map((c) => {
    const deltaHours = actual[c] - expected[c];
    const deltaPct = expected[c] > 0 ? deltaHours / expected[c] : 0;
    const trips =
      Math.abs(deltaPct) > DEV_PCT_THRESHOLD && Math.abs(deltaHours) >= DEV_ABS_THRESHOLD;
    return {
      category: c,
      actual: actual[c],
      expected: expected[c],
      deltaHours,
      deltaPct,
      flag: !trips ? 'ok' : deltaHours > 0 ? 'over' : 'under',
    };
  });
}

/**
 * Hours double-counted in the range (e.g. Work and Learn at once).
 * Also clipped to the range window, to match `loggedHours`.
 */
export function overlapForRange(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): number {
  const winStart = dayWindow(range.from).start;
  const winEnd = Math.min(dayWindow(range.to).end, now);

  let sum = 0;
  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const s = Math.max(a.startAt, winStart);
    const e = Math.min(a.endAt ?? now, winEnd);
    if (e > s) sum += e - s;
  }

  return Math.max(0, sum / H_MS - loggedHours(activities, range, now));
}
