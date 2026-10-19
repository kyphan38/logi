import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dragBounds, MAX_PINNED, rebalance, validateTargets } from '@/lib/balance';
import {
  TargetError,
  WEEK_CLOSED,
  assertOpen,
  assertValid,
  previewSwitch,
  totalDebt,
} from '@/lib/target-rules';
import { type Weekly } from '@/lib/rollover';
import { isLateChange } from '@/lib/week';
import {
  CATEGORIES,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type WeekTarget,
} from '@/types/logi';
import { at } from './_helpers.ts';

const total = (w: Weekly) => CATEGORIES.reduce((a, c) => a + w[c], 0);

function wt(over: Partial<WeekTarget> = {}): WeekTarget {
  return {
    week: '2026-W36',
    preset: 'normal',
    weekly: { ...PRESETS.normal.weekly },
    debtApplied: {},
    changedAt: 0,
    lateChange: false,
    lockedAt: null,
    ...over,
  };
}

// 2026-W36 = week of 2026-08-31 (Mon) to 2026-09-06 (Sun).
const TUE = at('2026-09-01', '10:00');
const FRI = at('2026-09-04', '10:00');
const SUN_2200 = at('2026-09-06', '22:00');

// --- Locked week -----------------------------------------------------

test('week with lockedAt → throws', () => {
  assert.throws(() => assertOpen(wt({ lockedAt: 1 }), '2026-W36', TUE), (e: unknown) => {
    assert.ok(e instanceof TargetError);
    assert.equal(e.code, 'locked');
    assert.equal(e.message, WEEK_CLOSED);
    return true;
  });
});

test('past 21:00 Sunday without lockedAt yet → still throws', () => {
  // Lazy lock: no cron, so the time mark is the source of truth.
  assert.throws(() => assertOpen(wt(), '2026-W36', SUN_2200), TargetError);
});

test('open week → does not throw', () => {
  assertOpen(wt(), '2026-W36', TUE);
  assertOpen(null, '2026-W36', TUE);
});

test('a past week is always closed, even if the doc does not exist', () => {
  assert.throws(() => assertOpen(null, '2026-W30', TUE), TargetError);
});

// --- lateChange -------------------------------------------------------

test('edit on Friday → lateChange true; Tuesday → false', () => {
  assert.equal(isLateChange(FRI), true);
  assert.equal(isLateChange(TUE), false);
});

test('editing on Sat and Sun is also late', () => {
  assert.equal(isLateChange(at('2026-09-05', '10:00')), true);
  assert.equal(isLateChange(at('2026-09-06', '10:00')), true);
});

test('02:00 Saturday still counts as Friday (logical day)', () => {
  assert.equal(isLateChange(at('2026-09-05', '02:00')), true);
  // But 02:00 Wednesday belongs to Tuesday → not late yet.
  assert.equal(isLateChange(at('2026-09-02', '02:00')), false);
});

// --- rebalance hits the floor ----------------------------------------------

test('rebalance: raising Work lowers the other categories, total unchanged', () => {
  const out = rebalance(PRESETS.normal.weekly, 'work', 51);
  assert.equal(out.work, 51);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11, `total = ${total(out)}`);
  assert.ok(out.fitness >= 4.5, 'the 4.5h Fitness floor is kept');
});

test('rebalance: never pushes a category below HARD_FLOOR', () => {
  // Raise Work very high - the balancing part must stop at the floor, never negative.
  const out = rebalance(PRESETS.normal.weekly, 'work', 90);
  for (const c of CATEGORIES) {
    assert.ok(out[c] >= (HARD_FLOOR[c] ?? 0) - 0.001, `${c} = ${out[c]} below floor`);
  }
});

test('rebalance: when nothing is left to cut, break the budget rather than the floor', () => {
  const out = rebalance(PRESETS.normal.weekly, 'work', 90);
  assert.equal(out.work, 90);
  assert.ok(total(out) > TOTAL_BUDGET, 'validateTargets catches this in the next step');
  assert.equal(validateTargets(out).ok, false);
});

test('rebalance: lowering Fitness to 3h is blocked by the slider `min`', () => {
  // rebalance takes the value as given; the UI enforces the floor first.
  const floor = HARD_FLOOR.fitness ?? 0;
  const out = rebalance(PRESETS.normal.weekly, 'fitness', floor);
  assert.equal(out.fitness, floor);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11);
});

// --- validateTargets --------------------------------------------------

test('validateTargets: over budget is caught', () => {
  const over = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work + 5 };
  const check = validateTargets(over);
  assert.equal(check.ok, false);
  assert.ok(check.errors.length > 0);
});

test('validateTargets: under budget is caught too', () => {
  const under = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work - 5 };
  assert.equal(validateTargets(under).ok, false);
});

test('validateTargets: all four base presets are valid', () => {
  for (const id of ['normal', 'crunch', 'deep_learn', 'recovery'] as const) {
    const check = validateTargets(PRESETS[id].weekly);
    assert.ok(check.ok, `${id}: ${check.errors.join(' ')}`);
  }
});

test('assertValid throws TargetError code invalid', () => {
  assert.throws(
    () => assertValid({ ...PRESETS.normal.weekly, work: 99 }),
    (e: unknown) => e instanceof TargetError && e.code === 'invalid'
  );
});

// --- previewSwitch ----------------------------------------------------

test('previewSwitch: switching to Crunch states the new debt', () => {
  const rows = previewSwitch(PRESETS.normal.weekly, 'crunch', {});
  const learn = rows.find((r) => r.category === 'learn')!;
  assert.equal(learn.from, PRESETS.normal.weekly.learn);
  assert.equal(learn.to, PRESETS.crunch.weekly.learn);
  assert.equal(learn.debt, PRESETS.normal.weekly.learn - PRESETS.crunch.weekly.learn);
});

test('previewSwitch: back to Normal creates no new debt', () => {
  const rows = previewSwitch(PRESETS.crunch.weekly, 'normal', {});
  for (const r of rows) assert.equal(r.debt, 0);
});

test('previewSwitch: debt is based on BASELINE, not the current week', () => {
  // Crunch to Crunch: `from` is unchanged but debt is still the cut vs
  // Normal. Computing from `from` would wrongly give 0.
  const rows = previewSwitch(PRESETS.crunch.weekly, 'crunch', {});
  const learn = rows.find((r) => r.category === 'learn')!;
  assert.ok(learn.debt > 0);
});

test('previewSwitch: adds back debtApplied, does not spend debt twice', () => {
  // Learn debt = hours to make up this week, so the Learn target must be higher.
  const plain = previewSwitch(PRESETS.normal.weekly, 'normal', {});
  const withDebt = previewSwitch(PRESETS.normal.weekly, 'normal', { learn: 6 });
  const a = plain.find((r) => r.category === 'learn')!;
  const b = withDebt.find((r) => r.category === 'learn')!;
  assert.ok(b.to > a.to, 'debt paid this week must be kept');
  assert.ok(b.debt < a.debt || a.debt === 0, 'more make-up hours means less new debt');
});

test('totalDebt sums every category', () => {
  assert.equal(totalDebt({}), 0);
  assert.equal(totalDebt({ learn: 12, fitness: 3 }), 15);
});

// ---------------------------------------------------------------------------
// Pinned categories - dragging one must not take hours from a pinned one
// ---------------------------------------------------------------------------

test('pin Learn: raising Work leaves Learn untouched', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'work', w.work + 6, ['learn']);
  assert.equal(out.learn, w.learn, 'Learn lost hours despite the pin');
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.05, 'total must still be 89h');
});

test('pinning the one being dragged is ignored', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'work', w.work + 4, ['work', 'learn']);
  assert.equal(out.work, w.work + 4);
  assert.equal(out.learn, w.learn);
});

test('pin 3: the fourth is the remainder, dragging it changes nothing', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'leisure', 20, ['work', 'learn', 'fitness']);
  assert.deepEqual(out, w, 'with nobody to balance, stay put rather than break 89h');
});

test('dragBounds: with no pins the max is 89h minus the other three floors', () => {
  const w = PRESETS.normal.weekly;
  const floors = CATEGORIES.filter((c) => c !== 'work').reduce(
    (a, c) => a + (HARD_FLOOR[c] ?? 0),
    0
  );
  assert.deepEqual(dragBounds(w, 'work'), {
    min: HARD_FLOOR.work ?? 0,
    max: TOTAL_BUDGET - floors,
  });
});

test('dragBounds: each extra pin lowers the max of the dragged one', () => {
  const w = PRESETS.normal.weekly;
  const free = dragBounds(w, 'work').max;
  const one = dragBounds(w, 'work', ['learn']).max;
  const two = dragBounds(w, 'work', ['learn', 'leisure']).max;
  assert.ok(one < free, `${one} must be less than ${free}`);
  assert.ok(two < one, `${two} must be less than ${one}`);
});

test('dragging to the exact dragBounds max still fits 89h', () => {
  const w = PRESETS.normal.weekly;
  for (const c of CATEGORIES) {
    const pinned = CATEGORIES.filter((x) => x !== c).slice(0, 2);
    const { max } = dragBounds(w, c, pinned);
    const out = rebalance(w, c, max, pinned);
    assert.ok(
      Math.abs(total(out) - TOTAL_BUDGET) < 0.05,
      `drag ${c} to max ${max} → total ${total(out)}`
    );
    assert.equal(validateTargets(out).ok, true, `${c} at max still reports an error`);
  }
});

test('pin then drag still breaks no floor', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'learn', 70, ['work']);
  for (const c of CATEGORIES) {
    assert.ok(out[c] >= (HARD_FLOOR[c] ?? 0) - 0.001, `${c} = ${out[c]} below floor`);
  }
});

test('MAX_PINNED is 3 - pinning all four leaves nothing to drag', () => {
  assert.equal(MAX_PINNED, CATEGORIES.length - 1);
});
