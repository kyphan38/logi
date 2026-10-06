// ---------------------------------------------------------------------------
// logi - The target of ONE day (Stage 4.5)
//
// `expectedHours()` in balance.ts sums the week so far. History only needs a
// one-day slice. This file keeps that exact formula, unchanged:
//
//     target[c][dow] = BASELINE_DAILY[c][dow] * (weekly[c] / BASELINE_WEEKLY[c])
//
// i.e. keep the baseline's weekly shape, scaled to the actual target.
// Pure function, no React → tested with `node --test`.
// ---------------------------------------------------------------------------
import { catchUp } from '@/lib/catchup';
import { BASELINE_DAILY, BASELINE_WEEKLY, CATEGORIES, type Category } from '@/types/logi';

/**
 * @param weekday 0 = Sun … 6 = Sat (matches `logicalWeekday()`)
 * @param weekly  the weekly target in effect (from `weekTarget.weekly`)
 */
export function dailyTargetFor(
  weekday: number,
  weekly: Record<Category, number>
): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    const base = BASELINE_WEEKLY[c];
    const scale = base > 0 ? weekly[c] / base : 0;
    out[c] = BASELINE_DAILY[c][weekday] * scale;
  }
  return out;
}

/** Below this the label is bolder to stand out. Never red. */
export const LOW_RATIO = 0.5;

export interface DayLine {
  category: Category;
  actual: number;
  /** The gauge denominator. With `doneBefore` it is the catch-up suggestion, else the standard. */
  target: number;
  /** Split by baseline, ignoring how far the week has gone. */
  standard: number;
  /** The weekly target was already met before this day. */
  met: boolean;
  /** The daily cap cut the suggestion. */
  capped: boolean;
  /** actual < 50% of target → needs attention. */
  low: boolean;
}

/**
 * Summary line: `Learn 1.5 / 3.0 · Work 9.5 / 9.5`.
 *
 * @param doneBefore hours logged on days BEFORE this one in the same logical week.
 *   With it, the denominator is the catch-up suggestion (see `catchUp`); `null` -
 *   the week's data is not loaded yet - falls back to the baseline split; still
 *   beats a jumping number.
 */
export function daySummary(
  actual: Record<Category, number>,
  weekly: Record<Category, number> | null,
  weekday: number,
  doneBefore: Record<Category, number> | null = null
): DayLine[] {
  if (!weekly) return [];

  const flat = dailyTargetFor(weekday, weekly);
  const plan = doneBefore ? catchUp(weekly, doneBefore, weekday) : null;

  const lines: DayLine[] = [];
  for (const c of CATEGORIES) {
    const a = actual[c] ?? 0;
    const standard = flat[c];
    const target = plan ? plan[c].suggested : standard;

    // A day off for this category (Fitness on Sunday) with nothing logged carries
    // no information - drop it. If something was logged, still show it so hours never vanish.
    if (a <= 0 && standard <= 0 && target <= 0) continue;

    lines.push({
      category: c,
      actual: a,
      target,
      standard,
      met: plan?.[c].met ?? false,
      capped: plan?.[c].capped ?? false,
      low: target > 0 && a < target * LOW_RATIO,
    });
  }
  return lines;
}


// ---------------------------------------------------------------------------
// The shape of one gauge cell on History (Stage 4.6 Task 4).
// Kept out of the component so it can be tested with `node --test`.
// ---------------------------------------------------------------------------
export interface GaugeShape {
  /** 0..1 - the filled part of the bar. Never above 1. */
  fill: number;
  /** Over target → full bar + a strong tick at the right edge. */
  over: boolean;
  /** No target (e.g. Fitness on Sunday) → no bar drawn, the number is `0.0/-`. */
  noTarget: boolean;
  /** No target and nothing logged → the cell carries nothing, so it fades. */
  dim: boolean;
}

export function gaugeShape(actual: number, target: number): GaugeShape {
  const noTarget = target <= 0;
  return {
    // Clamp both ends: a negative width is invalid CSS and the bar disappears.
    fill: noTarget ? 0 : Math.min(1, Math.max(0, actual / target)),
    over: !noTarget && actual > target,
    noTarget,
    dim: noTarget && actual <= 0,
  };
}
