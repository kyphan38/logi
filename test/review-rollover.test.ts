// ============================================================
// Hard rule: Weekly Review creates next week's target BEFORE rollover runs.
// Rollover must see that doc and LEAVE IT ALONE.
//
// This test replays the real sequence: Sunday evening review → Monday morning rollover.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planNextWeek } from '@/lib/review';
import {
  applyPlan,
  planRollover,
  type RolloverState,
  type WeekTargetSeed,
} from '@/lib/rollover';
import type { WeekTarget } from '@/types/logi';
import { at } from './_helpers.ts';

const W35 = '2026-W35';
const W36 = '2026-W36';

const SUNDAY = at('2026-08-30', '19:30'); // when review runs
const MONDAY = at('2026-08-31', '08:00'); // when rollover runs

/** weekTargets doc as Firestore would store it. */
function target(week: string, wt: Partial<WeekTarget> = {}): WeekTarget {
  return {
    week,
    preset: 'normal',
    weekly: { work: 43, learn: 31, fitness: 9, leisure: 6 },
    debtApplied: {},
    changedAt: SUNDAY,
    lateChange: false,
    lockedAt: null,
    ...wt,
  };
}

/** Exactly what `setupNextWeek()` writes. */
function fromReview(seed: ReturnType<typeof planNextWeek>): WeekTarget {
  return target(seed.week, {
    preset: seed.preset,
    weekly: seed.weekly,
    debtApplied: seed.applied,
  });
}

test('review picks Deep Learn for next week → rollover does NOT overwrite', () => {
  const debt = { learn: 6 };
  const plan36 = planNextWeek(W35, 'deep_learn', debt);

  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: plan36.remaining, // review already spent 50% of the debt
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const plan = planRollover(state);

  assert.deepEqual(plan.creates, [] as WeekTargetSeed[]);
  assert.deepEqual(plan.processed, [W35]);
  assert.deepEqual(plan.locks, [W35]); // the old week is still locked
  assert.equal(plan.lastProcessedWeek, W36);
});

test('review preset and debtApplied survive rollover', () => {
  const plan36 = planNextWeek(W35, 'deep_learn', { learn: 6 });
  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: plan36.remaining,
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const after = applyPlan(state, planRollover(state));
  const w36 = after.targets[W36]!;

  assert.equal(w36.preset, 'deep_learn');
  assert.equal(w36.debtApplied.learn, 3);
  assert.equal(w36.weekly.learn, plan36.weekly.learn);
});

test('debt is not spent twice: review spends 50%, rollover spends no more', () => {
  const plan36 = planNextWeek(W35, 'normal', { learn: 6 });
  assert.equal(plan36.applied.learn, 3);
  assert.equal(plan36.remaining.learn, 3);

  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: plan36.remaining,
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const after = applyPlan(state, planRollover(state));

  // Rollover does accrue NEW debt from W35 (that is its job),
  // but must not touch the 3h left over from before.
  assert.ok((after.debt.learn ?? 0) >= 3, 'remaining debt must stay intact');
  assert.equal(after.targets[W36]!.debtApplied.learn, 3);
});

test('running rollover twice → does nothing more (idempotent)', () => {
  const plan36 = planNextWeek(W35, 'crunch', {});
  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: {},
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const after = applyPlan(state, planRollover(state));
  const second = planRollover(after);

  assert.equal(second.reason, 'same-week');
  assert.deepEqual(second.creates, []);
  assert.deepEqual(second.locks, []);
  assert.equal(after.targets[W36]!.preset, 'crunch');
});

test('NO review → rollover still creates a Normal target as before', () => {
  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: {},
    targets: { [W35]: target(W35), [W36]: null },
    now: MONDAY,
  };

  const plan = planRollover(state);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].week, W36);
  assert.equal(plan.creates[0].preset, 'normal');
});

test('review this week then leave the app two weeks → middle week not overwritten', () => {
  const plan36 = planNextWeek(W35, 'recovery', {});
  const state: RolloverState = {
    currentWeek: '2026-W37',
    lastProcessedWeek: W35,
    debt: {},
    targets: { [W35]: target(W35), [W36]: fromReview(plan36), '2026-W37': null },
    now: at('2026-09-07', '08:00'),
  };

  const after = applyPlan(state, planRollover(state));

  assert.equal(after.targets[W36]!.preset, 'recovery'); // unchanged
  assert.equal(after.targets['2026-W37']!.preset, 'normal'); // only the new week is created
});
