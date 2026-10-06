import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rebalance } from '@/lib/balance';
import {
  BASELINE_WEEKLY,
  CATEGORIES,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type Category,
} from '@/types/logi';

// ---------------------------------------------------------------------------
// The zero-sum budget after removing Sleep (AMENDMENT-remove-sleep sections 2 + 12).
// ---------------------------------------------------------------------------

const total = (w: Record<Category, number>) => CATEGORIES.reduce((s, c) => s + w[c], 0);

const PRESET_IDS = ['normal', 'crunch', 'deep_learn', 'recovery'] as const;

test('TOTAL_BUDGET = 89h, no longer 135.5h', () => {
  assert.equal(TOTAL_BUDGET, 89);
  assert.equal(total(BASELINE_WEEKLY), 89);
});

test('four categories, no sleep', () => {
  assert.deepEqual([...CATEGORIES].sort(), ['fitness', 'learn', 'leisure', 'work']);
  assert.equal('sleep' in BASELINE_WEEKLY, false);
});

test('all 4 presets add up to exactly 89h', () => {
  for (const id of PRESET_IDS) {
    const w = PRESETS[id].weekly;
    assert.equal(total(w), TOTAL_BUDGET, `${id} = ${total(w)}h`);
    assert.equal('sleep' in w, false, `${id} still has sleep`);
  }
});

test('rebalance: raising one category makes the other 3 share the cost', () => {
  const base = PRESETS.normal.weekly;
  const out = rebalance(base, 'learn', base.learn + 6);

  assert.equal(out.learn, base.learn + 6);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11, `total = ${total(out)}`);

  // Even split: nobody is skipped, nobody carries it all.
  for (const c of CATEGORIES) {
    if (c === 'learn') continue;
    assert.ok(out[c] < base[c], `${c} must go down`);
  }
});

test('rebalance: the 4.5h Fitness floor is never broken', () => {
  const base = PRESETS.normal.weekly;
  const floor = HARD_FLOOR.fitness ?? 0;
  assert.equal(floor, 4.5);

  // Raise Work very high - the balancing part must stop at the floor, never negative.
  const out = rebalance(base, 'work', 80);
  assert.ok(out.fitness >= floor, `fitness = ${out.fitness}`);
  for (const c of CATEGORIES) assert.ok(out[c] >= 0, `${c} is negative`);
});

test('rebalance: lowering gives back to the other 3, total still 89h', () => {
  const base = PRESETS.normal.weekly;
  const out = rebalance(base, 'work', base.work - 9);

  assert.equal(out.work, base.work - 9);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11, `total = ${total(out)}`);
  for (const c of CATEGORIES) {
    if (c === 'work') continue;
    assert.ok(out[c] > base[c], `${c} must go up`);
  }
});
