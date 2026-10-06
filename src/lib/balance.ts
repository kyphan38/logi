// ============================================================
// logi - Logical time, pro-rated targets, deviation, debt
// ============================================================

import {
  CATEGORIES, BASELINE_DAILY, BASELINE_WEEKLY, CATEGORY_LABEL,
  DAY_CUTOFF_HOUR, HARD_FLOOR, TOTAL_BUDGET, PRESETS,
  DEBT_CARRYOVER_RATE, DEBT_CARRYOVER_CAP,
  type Activity, type Category, type PresetId,
} from '@/types/logi';

// ------------------------------------------------------------
// 1. Logical day / week
// ------------------------------------------------------------

/**
 * Logical day: cut at 04:00 instead of midnight.
 * Sleep at 22:00 Mon → "Mon". A nap at 02:00 Tue → also "Mon".
 * All analytics must go through this, never raw calendar dates.
 */
export function logicalDate(ts: number): string {
  const d = new Date(ts);
  if (d.getHours() < DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Weekday of the logical day. 0 = Sun ... 6 = Sat */
export function logicalWeekday(ts: number): number {
  const [y, m, d] = logicalDate(ts).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** ISO week, e.g. "2026-W35". Weeks start on Monday. */
export function logicalWeek(ts: number): string {
  const [y, m, d] = logicalDate(ts).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7;          // CN = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); // move to Thursday
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Share of the logical day that has passed, 0..1. Used to pro-rate today's target. */
export function dayProgress(now: number = Date.now()): number {
  const d = new Date(now);
  let h = d.getHours() - DAY_CUTOFF_HOUR;
  if (h < 0) h += 24;
  return Math.min(1, (h + d.getMinutes() / 60) / 24);
}

// ------------------------------------------------------------
// 2. Summing actual duration
// ------------------------------------------------------------

/**
 * Running sessions count up to now - the timer is derived state, never an
 * accumulating counter.
 */
export function actualHours(
  activities: Activity[],
  now: number = Date.now()
): Record<Category, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const end = a.endAt ?? now;
    if (end <= a.startAt) continue;
    out[a.category] += (end - a.startAt) / 3_600_000;
  }
  return out;
}

/**
 * Total time double-counted by parallel logs (e.g. Work and Learn at once).
 * This number must be shown - otherwise daily totals exceed 24h unnoticed.
 * That is why every chart uses ABSOLUTE HOURS, not % of 24h.
 */
export function overlapHours(activities: Activity[], now: number = Date.now()): number {
  const iv = activities
    .filter((a) => a.status === 'active' || a.status === 'done')
    .map((a) => [a.startAt, a.endAt ?? now] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);

  let overlap = 0;
  let maxEnd = -Infinity;
  for (const [s, e] of iv) {
    if (s < maxEnd) overlap += (Math.min(e, maxEnd) - s);
    maxEnd = Math.max(maxEnd, e);
  }
  return overlap / 3_600_000;
}

// ------------------------------------------------------------
// 3. Expected - pro-rated by CALENDAR, not split evenly
// ------------------------------------------------------------

/**
 * Mid-week, Work's expected is NOT 43 × 3/7.
 * Sum each past day's target, plus today's fraction.
 * Without this the app would tell you "short on Work" every Tuesday.
 */
export function expectedHours(
  weeklyTarget: Record<Category, number>,
  now: number = Date.now()
): Record<Category, number> {
  const todayDow = logicalWeekday(now);
  const elapsedDows: number[] = [];
  for (let i = 1; i < 8; i++) {         // the week starts on Monday
    const dow = i % 7;
    if (dow === todayDow) break;
    elapsedDows.push(dow);
  }
  const frac = dayProgress(now);

  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    const shape = BASELINE_DAILY[c];
    const scale = weeklyTarget[c] / BASELINE_WEEKLY[c]; // keep the week's shape
    let h = 0;
    for (const dow of elapsedDows) h += shape[dow] * scale;
    h += shape[todayDow] * scale * frac;
    out[c] = h;
  }
  return out;
}

// ------------------------------------------------------------
// 4. Deviation - double deadband
// ------------------------------------------------------------

export const DEV_PCT_THRESHOLD = 0.25; // 25%
export const DEV_ABS_THRESHOLD = 2;    // 2 hours

export interface Deviation {
  category: Category;
  actual: number;
  expected: number;
  weeklyTarget: number;
  deltaHours: number;
  deltaPct: number;
  flag: 'over' | 'under' | 'ok';
}

/**
 * Only alert when off by >25% AND >=2h.
 * The second condition is key: without it, Leisure 40 minutes off would fire
 * a warning, and you would quit the app within 3 days.
 */
export function deviations(
  activities: Activity[],
  weeklyTarget: Record<Category, number>,
  now: number = Date.now()
): Deviation[] {
  const act = actualHours(activities, now);
  const exp = expectedHours(weeklyTarget, now);

  return CATEGORIES.map((c) => {
    const deltaHours = act[c] - exp[c];
    const deltaPct = exp[c] > 0 ? deltaHours / exp[c] : 0;
    const trips = Math.abs(deltaPct) > DEV_PCT_THRESHOLD && Math.abs(deltaHours) >= DEV_ABS_THRESHOLD;
    return {
      category: c,
      actual: act[c],
      expected: exp[c],
      weeklyTarget: weeklyTarget[c],
      deltaHours,
      deltaPct,
      flag: !trips ? 'ok' : deltaHours > 0 ? 'over' : 'under',
    };
  });
}

/**
 * Wording: STATE NUMBERS, DO NOT LECTURE.
 * "You spent more on X than balance allows" grates after a few times.
 */
export function formatDeviation(d: Deviation): string {
  const sign = d.deltaHours > 0 ? '+' : '';
  return `${d.category}: ${d.actual.toFixed(1)}h / ${d.expected.toFixed(1)}h (${sign}${Math.round(d.deltaPct * 100)}%)`;
}

/**
 * A rule for the pain point: weekend OT eating Learn.
 * Worth more than any general deviation because it links two categories.
 */
export function weekendConflict(
  activities: Activity[],
  weeklyTarget: Record<Category, number>,
  now: number = Date.now()
): string | null {
  const weekend = activities.filter((a) => [0, 6].includes(logicalWeekday(a.startAt)));
  const w = actualHours(weekend, now);
  if (w.work <= 0) return null;

  const learnTarget = weeklyTarget.learn;
  const learnActual = actualHours(activities, now).learn;
  const gap = learnTarget - learnActual;
  if (gap < DEV_ABS_THRESHOLD) return null;

  return `Weekend OT: ${w.work.toFixed(1)}h. Learn is ${gap.toFixed(1)}h short of the ${learnTarget}h target.`;
}

// ------------------------------------------------------------
// 5. Zero-sum budget - no overbooking
// ------------------------------------------------------------

export interface BudgetCheck {
  ok: boolean;
  total: number;
  budget: number;
  errors: string[];
}

/**
 * Time cannot be added to a week - only moved around.
 * Raising Work by +8h means the UI MUST take those 8h from another category.
 */
export function validateTargets(weekly: Record<Category, number>): BudgetCheck {
  const errors: string[] = [];
  const total = Object.values(weekly).reduce((a, b) => a + b, 0);

  if (Math.abs(total - TOTAL_BUDGET) > 0.1) {
    const diff = total - TOTAL_BUDGET;
    errors.push(
      diff > 0
        ? `Over by ${diff.toFixed(1)}h - reduce another category`
        : `${(-diff).toFixed(1)}h unallocated`
    );
  }
  for (const [c, floor] of Object.entries(HARD_FLOOR)) {
    if (weekly[c as Category] < floor!) {
      errors.push(`${CATEGORY_LABEL[c as Category]} can’t go below ${floor}h/week`);
    }
  }
  return { ok: errors.length === 0, total, budget: TOTAL_BUDGET, errors };
}

/**
 * PINNED categories: the user fixed the number, nobody may take their hours.
 *
 * At most 3 pinned. Pin a fourth and nobody is left to balance, while the
 * total must still be exactly 89h - the screen becomes four number boxes to
 * add up by hand, which is a calculator's job, not a slider's.
 */
export const MAX_PINNED = 3;

/**
 * The drag limits of ONE category while others are pinned.
 *
 * `max` is not 89h: the pinned share is spent, and every remaining category
 * must keep its floor. Without this limit, overdragging pushes the total over
 * 89h with nobody to absorb it - Save turns off and the user does not know why.
 */
export function dragBounds(
  weekly: Record<Category, number>,
  changed: Category,
  pinned: Iterable<Category> = []
): { min: number; max: number } {
  const locked = new Set(pinned);
  locked.delete(changed);
  const donors = CATEGORIES.filter((c) => c !== changed && !locked.has(c));

  const lockedSum = [...locked].reduce((a, c) => a + weekly[c], 0);
  const floorSum = donors.reduce((a, c) => a + (HARD_FLOOR[c] ?? 0), 0);

  const min = HARD_FLOOR[changed] ?? 0;
  return { min, max: Math.max(min, TOTAL_BUDGET - lockedSum - floorSum) };
}

/**
 * Dragging one category spreads the change evenly over the REMAINING, UNPINNED ones.
 *
 * Nobody left to balance (the other 3 pinned) → return unchanged: the fourth
 * category's value follows from the other three and cannot be dragged.
 */
export function rebalance(
  weekly: Record<Category, number>,
  changed: Category,
  newValue: number,
  pinned: Iterable<Category> = []
): Record<Category, number> {
  const locked = new Set(pinned);
  locked.delete(changed);
  const others = CATEGORIES.filter((c) => c !== changed && !locked.has(c));
  if (others.length === 0) return { ...weekly };

  // Do NOT clamp `newValue` here: `rebalance` takes exactly what it is given,
  // and the slider enforces floor and cap first via `dragBounds()`. Clamping
  // in both places hides which one is lying when something goes wrong.
  const next = { ...weekly, [changed]: newValue };
  let delta = Object.values(next).reduce((a, b) => a + b, 0) - TOTAL_BUDGET;

  for (let pass = 0; pass < 5 && Math.abs(delta) > 0.05; pass++) {
    const pool = others.filter((c) => next[c] - (HARD_FLOOR[c] ?? 0) > 0.05 || delta < 0);
    if (!pool.length) break;
    const share = delta / pool.length;
    for (const c of pool) {
      next[c] = Math.max(HARD_FLOOR[c] ?? 0, next[c] - share);
    }
    delta = Object.values(next).reduce((a, b) => a + b, 0) - TOTAL_BUDGET;
  }
  return next;
}

// ------------------------------------------------------------
// 6. Debt - making cuts cost something
// ------------------------------------------------------------

/** End of week: the gap from baseline is recorded as debt. */
export function accrueDebt(
  weekly: Record<Category, number>,
  current: Partial<Record<Category, number>>
): Partial<Record<Category, number>> {
  const next = { ...current };
  for (const c of CATEGORIES) {
    const cut = BASELINE_WEEKLY[c] - weekly[c];
    if (cut > 0) next[c] = (next[c] ?? 0) + cut;
  }
  return next;
}

/** Start of week: add 50% of debt to the target, capped at 10h. A cut is only a delay. */
export function applyDebt(
  weekly: Record<Category, number>,
  debt: Partial<Record<Category, number>>
): { weekly: Record<Category, number>; applied: Partial<Record<Category, number>>; remaining: Partial<Record<Category, number>> } {
  const applied: Partial<Record<Category, number>> = {};
  const remaining = { ...debt };
  const next = { ...weekly };

  for (const c of CATEGORIES) {
    const owed = debt[c] ?? 0;
    if (owed <= 0) continue;
    const pay = Math.min(owed * DEBT_CARRYOVER_RATE, DEBT_CARRYOVER_CAP);
    next[c] += pay;
    applied[c] = pay;
    remaining[c] = owed - pay;
  }
  return { weekly: next, applied, remaining };
}

/** Crunch 4 out of 6 weeks is no longer crunch - it is the real baseline. */
export function crunchStreak(history: { preset: PresetId }[]): { count: number; of: number; shouldPrompt: boolean } {
  const recent = history.slice(-6);
  const count = recent.filter((w) => w.preset === 'crunch').length;
  return { count, of: recent.length, shouldPrompt: recent.length >= 6 && count >= 4 };
}

// ------------------------------------------------------------
// 7. Forgotten sessions
// ------------------------------------------------------------

/** Over 15h → abandoned, NEVER deleted. Ask for the end time when the app opens. */
export function findStale(activities: Activity[], now: number = Date.now()): Activity[] {
  return activities.filter(
    (a) => a.status === 'active' && now - a.startAt > 15 * 3_600_000
  );
}

export function suggestedEndTimes(a: Activity): { label: string; ts: number }[] {
  const d = new Date(a.startAt);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
  const map: Record<Category, number[]> = {
    work: [17, 22], learn: [6, 22], fitness: [19], leisure: [22],
  };
  return (map[a.category] ?? [22])
    .map((h) => ({ label: `${String(h).padStart(2, '0')}:00`, ts: at(h) }))
    .filter((x) => x.ts > a.startAt);
}

export { PRESETS };
