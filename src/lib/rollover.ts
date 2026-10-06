// ============================================================
// logi - Week rollover + folding debt into the target
//
// Pure file: NO Firestore import, NO React. Tested with `node --test`.
// `targets.ts` only does two things: read data in, write results out.
//
// There is no server cron. Rollover runs on the client when the app opens, so
// it must be idempotent: opening the app twice on Monday morning and adding
// debt twice would not crash or warn - the Learn target would just swell
// absurdly over a few weeks with no traceable cause.
// ============================================================

import { accrueDebt, applyDebt } from '@/lib/balance';
import { addWeeks, weekDiff } from '@/lib/week';
import {
  CATEGORIES,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type Category,
  type PresetId,
  type WeekTarget,
} from '@/types/logi';

/** Beyond 8 weeks back, history is not rebuilt - only the marker is reset. */
export const MAX_ROLLOVER_WEEKS = 8;

export type DebtBalance = Partial<Record<Category, number>>;
export type Weekly = Record<Category, number>;

// ------------------------------------------------------------
// 1. Paying debt while keeping the budget zero-sum
// ------------------------------------------------------------

const sum = (w: Weekly) => CATEGORIES.reduce((a, c) => a + w[c], 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `applyDebt()` ADDS hours to the target (Learn +6h), so the total jumps to 95h.
 * But a week still only has 89h to allocate - paying Learn debt must come from
 * Work or Leisure, not from thin air.
 *
 * Same idea as `rebalance()` but it can lock SEVERAL categories at once: every
 * category that just received debt.
 * Does not touch `balance.ts` or how `applyDebt` computes the payment.
 */
export function settleWithinBudget(weekly: Weekly, applied: DebtBalance): Weekly {
  const next = { ...weekly };
  // With Sleep gone no category is fixed; only the ones receiving debt are locked.
  const locked = new Set<Category>();

  for (const c of CATEGORIES) {
    const pay = applied[c] ?? 0;
    if (pay > 0) {
      next[c] += pay;
      locked.add(c);
    }
  }

  const donors = CATEGORIES.filter((c) => !locked.has(c));
  let delta = sum(next) - TOTAL_BUDGET;

  for (let pass = 0; pass < 5 && Math.abs(delta) > 0.01; pass++) {
    const pool = donors.filter((c) => next[c] - (HARD_FLOOR[c] ?? 0) > 0.01 || delta < 0);
    if (!pool.length) break;
    const share = delta / pool.length;
    for (const c of pool) next[c] = Math.max(HARD_FLOOR[c] ?? 0, next[c] - share);
    delta = sum(next) - TOTAL_BUDGET;
  }

  return roundToBudget(next);
}

/**
 * Rounds to 2 decimals, then puts the remainder into the largest category, so
 * the total matches TOTAL_BUDGET exactly. Without it `validateTargets()`
 * sometimes reports "0.03h unallocated" from floating-point error.
 */
export function roundToBudget(weekly: Weekly): Weekly {
  const next = {} as Weekly;
  for (const c of CATEGORIES) next[c] = r2(weekly[c]);

  const residual = r2(TOTAL_BUDGET - sum(next));
  if (residual !== 0) {
    let best: Category = CATEGORIES[0];
    for (const c of CATEGORIES) if (next[c] > next[best]) best = c;
    next[best] = r2(next[best] + residual);
  }
  return next;
}

/**
 * A week's target = preset + the debt payment, pulled back to exactly 89h.
 * Used by both `ensureWeekTarget` and `setPreset`.
 */
export function buildWeekly(
  base: Weekly,
  debt: DebtBalance
): { weekly: Weekly; applied: DebtBalance; remaining: DebtBalance } {
  const { applied, remaining } = applyDebt(base, debt);
  return { weekly: settleWithinBudget(base, applied), applied, remaining };
}

/** Adds the week's already recorded `debtApplied` onto another preset. Spends no more debt. */
export function reapplyDebt(base: Weekly, debtApplied: DebtBalance): Weekly {
  return settleWithinBudget(base, debtApplied);
}

// ------------------------------------------------------------
// 2. The rollover plan
// ------------------------------------------------------------

export interface WeekTargetSeed {
  week: string;
  preset: PresetId;
  weekly: Weekly;
  debtApplied: DebtBalance;
}

export interface RolloverState {
  currentWeek: string;
  lastProcessedWeek: string | null;
  debt: DebtBalance;
  /** Already read inside the transaction. Missing key = that week has no doc. */
  targets: Partial<Record<string, WeekTarget | null>>;
  now: number;
}

export interface RolloverPlan {
  /** Why this plan came out - for logs and readable tests. */
  reason: 'first-run' | 'same-week' | 'processed' | 'too-far';
  /** Weeks to close retroactively. */
  locks: string[];
  /** Weeks needing a new doc. */
  creates: WeekTargetSeed[];
  /** The final `meta/debt`. null = nothing to write. */
  debt: DebtBalance | null;
  /** The new marker. null = nothing to write. */
  lastProcessedWeek: string | null;
  /** Weeks closed and turned into debt. */
  processed: string[];
  /** Weeks that passed with no plan → nothing to owe. */
  skipped: string[];
}

/**
 * Weeks whose docs must be read before planning.
 * Firestore requires every read before every write in a transaction, so this
 * list must be known up front.
 */
export function weeksToRead(currentWeek: string, lastProcessedWeek: string | null): string[] {
  const weeks = new Set<string>([currentWeek]);
  if (lastProcessedWeek && lastProcessedWeek !== currentWeek) {
    const gap = weekDiff(lastProcessedWeek, currentWeek);
    if (gap > 0 && gap <= MAX_ROLLOVER_WEEKS) {
      for (let i = 0; i < gap; i++) weeks.add(addWeeks(lastProcessedWeek, i));
    }
  }
  return [...weeks];
}

const NORMAL: Weekly = PRESETS.normal.weekly;

/**
 * Fully pure: the same input always gives the same output, no clock.
 *
 * Idempotence lives in `lastProcessedWeek`. A second run with the updated
 * state has `last === currentWeek` → reason 'same-week' → writes nothing.
 */
export function planRollover(state: RolloverState): RolloverPlan {
  const { currentWeek, lastProcessedWeek: last } = state;
  const targets = state.targets;

  const empty = (reason: RolloverPlan['reason']): RolloverPlan => ({
    reason,
    locks: [],
    creates: [],
    debt: null,
    lastProcessedWeek: null,
    processed: [],
    skipped: [],
  });

  // Already ran for this week. This branch is what stops double debt.
  if (last === currentWeek) return empty('same-week');

  const locks: string[] = [];
  const processed: string[] = [];
  const skipped: string[] = [];
  let debt: DebtBalance = { ...state.debt };
  let debtChanged = false;

  const gap = last === null ? 0 : weekDiff(last, currentWeek);
  const reason: RolloverPlan['reason'] =
    last === null ? 'first-run' : gap > MAX_ROLLOVER_WEEKS || gap <= 0 ? 'too-far' : 'processed';

  if (reason === 'processed' && last !== null) {
    // One week at a time, in order. Jumping ahead would lose the middle weeks' debt.
    for (let i = 1; i <= gap; i++) {
      const prev = addWeeks(last, i - 1);
      const wt = targets[prev] ?? null;
      if (!wt) {
        // The app was not opened that week → no plan → nothing to owe.
        skipped.push(prev);
        continue;
      }
      if (wt.lockedAt === null) locks.push(prev);
      debt = accrueDebt(wt.weekly, debt);
      debtChanged = true;
      processed.push(prev);
    }
  }

  // The current week: only created if missing. Empty weeks in between stay as
  // they are - fake docs for them would cut debt 50% each week and dilute crunchStreak.
  const creates: WeekTargetSeed[] = [];
  if (!targets[currentWeek]) {
    const { weekly, applied, remaining } = buildWeekly(NORMAL, debt);
    creates.push({ week: currentWeek, preset: 'normal', weekly, debtApplied: applied });
    if (Object.values(applied).some((v) => (v ?? 0) > 0)) {
      debt = remaining;
      debtChanged = true;
    }
  }

  return {
    reason,
    locks,
    creates,
    debt: debtChanged ? debt : null,
    lastProcessedWeek: currentWeek,
    processed,
    skipped,
  };
}

/** Applies a plan to state - used in tests to run twice in a row. */
export function applyPlan(state: RolloverState, plan: RolloverPlan): RolloverState {
  const targets = { ...state.targets };
  for (const w of plan.locks) {
    const wt = targets[w];
    if (wt) targets[w] = { ...wt, lockedAt: state.now };
  }
  for (const seed of plan.creates) {
    targets[seed.week] = {
      week: seed.week,
      preset: seed.preset,
      weekly: seed.weekly,
      debtApplied: seed.debtApplied,
      changedAt: state.now,
      lateChange: false,
      lockedAt: null,
    };
  }
  return {
    ...state,
    targets,
    debt: plan.debt ?? state.debt,
    lastProcessedWeek: plan.lastProcessedWeek ?? state.lastProcessedWeek,
  };
}
