// Tests for the visual parts that can be pulled out into pure functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gaugeShape } from '@/lib/day-target';
import { budgetMessages, PRESET_HINT } from '@/lib/copy';
import { catInk, catTint } from '@/lib/category-style';
import { validateTargets } from '@/lib/balance';
import { CATEGORIES, HARD_FLOOR, PRESETS, TOTAL_BUDGET } from '@/types/logi';

// --- Gauge (Task 4) ---------------------------------------------------

test('gauge: fill = actual / target', () => {
  const g = gaugeShape(1.6, 3.2);
  assert.equal(g.fill, 0.5);
  assert.equal(g.over, false);
  assert.equal(g.noTarget, false);
  assert.equal(g.dim, false);
});

test('gauge: over target → full bar + amber mark, does NOT overflow', () => {
  const g = gaugeShape(9, 3);
  assert.equal(g.fill, 1, 'fill must be capped at 1');
  assert.equal(g.over, true);
});

test('gauge: exactly at target is not over yet', () => {
  const g = gaugeShape(3, 3);
  assert.equal(g.fill, 1);
  assert.equal(g.over, false);
});

test('gauge: target 0 (Sunday Fitness) → no bar', () => {
  const g = gaugeShape(1.5, 0);
  assert.equal(g.noTarget, true);
  assert.equal(g.fill, 0);
  assert.equal(g.over, false, 'no target, nothing to exceed');
  assert.equal(g.dim, false, 'with logs it must stay readable');
});

test('gauge: no target, no logs → dim the whole cell', () => {
  assert.equal(gaugeShape(0, 0).dim, true);
});

test('gauge: fill is never negative or NaN', () => {
  for (const [a, t] of [
    [0, 3],
    [0, 0],
    [5, 0],
    [-1, 3],
  ] as const) {
    const g = gaugeShape(a, t);
    assert.ok(Number.isFinite(g.fill), `NaN for (${a}, ${t})`);
    assert.ok(g.fill >= 0 && g.fill <= 1, `out of range for (${a}, ${t})`);
  }
});

// --- English copy -------------------------------------------------------

test('every preset has an English hint', () => {
  for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const hint = PRESET_HINT[id];
    assert.ok(hint, `missing hint for ${id}`);
    // Vietnamese tone marks sit outside basic Latin-1.
    assert.doesNotMatch(hint, /[À-ỹ]/, `${id} still has Vietnamese: ${hint}`);
  }
});

test('budgetMessages: over budget says by how much', () => {
  const over = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work + 3 };
  const msgs = budgetMessages(over);
  assert.equal(msgs[0], 'Over by 3.0h - reduce another category');
});

test('budgetMessages: unallocated hours left', () => {
  const under = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work - 3 };
  assert.equal(budgetMessages(under)[0], '3.0h unallocated');
});

test('budgetMessages: hitting the floor names the category', () => {
  const floor = HARD_FLOOR.fitness ?? 0;
  const bad = { ...PRESETS.normal.weekly, fitness: floor - 1, work: PRESETS.normal.weekly.work + 1 };
  const msgs = budgetMessages(bad);
  assert.ok(
    msgs.some((m) => m.includes('Fitness') && m.includes('below')),
    `Fitness not mentioned: ${msgs.join(' | ')}`,
  );
});

test('budgetMessages is silent exactly when validateTargets says ok', () => {
  // The wording lives in copy.ts, but the RULES still belong to balance.ts.
  for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const w = PRESETS[id].weekly;
    assert.equal(
      budgetMessages(w).length === 0,
      validateTargets(w).ok,
      `mismatch on preset ${id}`,
    );
  }
});

test('preset totals still match the budget - copy.ts does not touch numbers', () => {
  for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const total = CATEGORIES.reduce((a, c) => a + PRESETS[id].weekly[c], 0);
    assert.ok(Math.abs(total - TOTAL_BUDGET) < 0.11, `${id} off: ${total}`);
  }
});

// --- Color tokens -------------------------------------------------------

test('tint/ink return CSS vars, not hex - so dark mode switches by itself', () => {
  for (const c of CATEGORIES) {
    assert.match(catTint(c), /^var\(--cat-[a-z]+-tint\)$/);
    assert.match(catInk(c), /^var\(--cat-[a-z]+-ink\)$/);
    assert.doesNotMatch(catTint(c), /#[0-9a-f]{6}/i);
  }
});
