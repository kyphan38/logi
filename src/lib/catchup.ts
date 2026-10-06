// ---------------------------------------------------------------------------
// logi - Catch-up suggestion by days left (Stage 7)
//
// `dailyTargetFor()` splits the weekly target by the baseline shape, ignoring
// how far the week has gone. Study 10h on Monday and on Tuesday it still says
// 3h - true to the old plan, but useless: that plan was already wrong yesterday.
//
// Here the suggestion = the week's REMAINING hours, spread over the days NOT
// YET PASSED, keeping the baseline's weekday / weekend ratio.
//
//     suggest(d) = remaining * shape[d] / (sum of shape from d to Sunday)
//
// Key property: if today does exactly the suggestion, tomorrow's recompute gives
// exactly the number today predicted. The plan does not drift.
//
//     R' = R - R·s_d/S = R·(S-s_d)/S = R·S'/S
//     suggest(d+1) = R'·s_{d+1}/S' = R·s_{d+1}/S   ✓
//
// Then cap per day: owing 30h of Learn with only Friday left, saying "study
// 30h" would be absurd.
// Pure function, no React → tested with `node --test`.
// ---------------------------------------------------------------------------
import { BASELINE_DAILY, BASELINE_WEEKLY, CATEGORIES, type Category } from '@/types/logi';

/**
 * The cap for one day - a suggestion never exceeds it.
 *
 * Not a "standard", a cap: a weekday Learn standard of 3h with a 5h cap means
 * 2h of catch-up allowed. The weekend standard is already 8h, so its cap must
 * be 10h; a 5h cap would block a normal Saturday.
 *
 * Weekend = Sunday (0) and Saturday (6).
 */
export const DAY_CAP: Record<Category, { weekday: number; weekend: number }> = {
  learn: { weekday: 5, weekend: 10 },
  work: { weekday: 10, weekend: 4 },
  fitness: { weekday: 3, weekend: 3 },
  leisure: { weekday: 2, weekend: 4 },
};

export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

export function dayCap(c: Category, dow: number): number {
  return isWeekend(dow) ? DAY_CAP[c].weekend : DAY_CAP[c].weekday;
}

/**
 * The logical week runs Mon → Sun, while `dow` is 0 = Sun … 6 = Sat (like `Date.getDay()`).
 * Convert to a position in the week to know days left: Mon = 0 … Sun = 6.
 */
export function weekPos(dow: number): number {
  return (dow + 6) % 7;
}

/** The inverse of `weekPos`. */
export function dowAt(pos: number): number {
  return (pos + 1) % 7;
}

export interface CatchUp {
  /** Hours to do that day. Capped and rounded to 0.1. */
  suggested: number;
  /** Split by baseline, ignoring how far the week has gone. For comparison. */
  standard: number;
  /** Hours still owed for the week, as of the start of this day. */
  remaining: number;
  /** Days left, including this one. */
  daysLeft: number;
  /** Weekly target done - the rest is 0. */
  met: boolean;
  /** The cap cut it: one day cannot hold all the debt. */
  capped: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * @param weekly     the weekly target in effect (`weekTarget.weekly`)
 * @param doneBefore hours logged on days BEFORE this one, in the same logical week.
 *   Leaves out the viewed day's own hours - otherwise the denominator shrinks
 *   while you chase it, a different target on each look.
 * @param dow        0 = Sun … 6 = Sat
 */
export function catchUp(
  weekly: Record<Category, number>,
  doneBefore: Record<Category, number>,
  dow: number
): Record<Category, CatchUp> {
  const pos = weekPos(dow);
  const daysLeft = 7 - pos;

  const out = {} as Record<Category, CatchUp>;

  for (const c of CATEGORIES) {
    const shape = BASELINE_DAILY[c];
    const base = BASELINE_WEEKLY[c];
    // Keep the unrounded value for the cap: rounding first then comparing turns
    // 12.645 into 12.6, and an exact plan gets flagged "at cap".
    const stdRaw = base > 0 ? shape[dow] * (weekly[c] / base) : 0;
    const standard = r1(stdRaw);

    const remaining = Math.max(0, weekly[c] - (doneBefore[c] ?? 0));
    const met = weekly[c] > 0 && remaining <= 0;

    if (remaining <= 0) {
      out[c] = { suggested: 0, standard, remaining: 0, daysLeft, met, capped: false };
      continue;
    }

    // Sum of the shape over the days not yet passed.
    let sum = 0;
    for (let p = pos; p <= 6; p++) sum += shape[dowAt(p)];

    // shape[dow] === 0 is this category's day off - Fitness on Sunday, Work on
    // weekends. No debt is ever pushed onto a day off: `raw` comes out 0.
    // sum === 0 means every remaining day is off; dividing by 0 is blocked here.
    // The weekly target is then out of reach - that is the truth, not a bug,
    // and Analytics already reports the shortfall.
    const raw = sum > 0 ? remaining * (shape[dow] / sum) : 0;

    // The cap only limits the CATCH-UP part; it must not overrule the plan. With
    // a 49h/week Learn target, Saturday's standard is already 12.6h, above the
    // 10h cap - capping at 10h flags every on-plan week "at cap" and never reaches
    // the target. The real cap = the hard cap or the day's standard, whichever is higher.
    const cap = Math.max(dayCap(c, dow), stdRaw);
    const suggested = Math.min(raw, cap);

    out[c] = {
      suggested: r1(suggested),
      standard,
      remaining: r1(remaining),
      daysLeft,
      met,
      // Only flag a meaningful cut (> 15 minutes). Daily 0.1h rounding drifts a
      // few minutes over a week; flagging "at cap" for those is a false alarm.
      capped: raw - suggested > 0.25,
    };
  }

  return out;
}
