import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dailyTargetFor, daySummary, LOW_RATIO } from '@/lib/day-target';
import { expectedHours, logicalWeekday } from '@/lib/balance';
import { BASELINE_WEEKLY, CATEGORIES, PRESETS, type Category } from '@/types/logi';
import { at } from './_helpers.ts';

// 0 = CN … 6 = T7
const SUN = 0;
const TUE = 2;

const zero = () =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

// --- dailyTargetFor ---------------------------------------------------------

test('dailyTargetFor: Tuesday on Normal → Work 9.5 (8h + 1.5h commute)', () => {
  const t = dailyTargetFor(TUE, PRESETS.normal.weekly);
  assert.equal(+t.work.toFixed(2), 9.5, 'must not be 8.0');
  assert.equal(+t.learn.toFixed(2), 3.0);
});

test('dailyTargetFor: Sunday → Learn 8.0, Fitness 0', () => {
  const t = dailyTargetFor(SUN, PRESETS.normal.weekly);
  assert.equal(+t.learn.toFixed(2), 8.0);
  assert.equal(t.fitness, 0, 'Sunday is a rest day');
});

test('dailyTargetFor: the 7-day sum = the weekly target, for every preset', () => {
  for (const id of ['normal', 'crunch', 'deep_learn', 'recovery'] as const) {
    const weekly = PRESETS[id].weekly;
    for (const c of CATEGORIES) {
      let sum = 0;
      for (let dow = 0; dow < 7; dow++) sum += dailyTargetFor(dow, weekly)[c];
      assert.ok(
        Math.abs(sum - weekly[c]) < 0.001,
        `${id}/${c}: 7 days = ${sum.toFixed(2)} but weekly = ${weekly[c]}`
      );
    }
  }
});

test('dailyTargetFor: Crunch scales correctly, keeping the week shape', () => {
  const weekly = PRESETS.crunch.weekly;
  const scale = weekly.work / BASELINE_WEEKLY.work;
  const normalTue = dailyTargetFor(TUE, PRESETS.normal.weekly);
  const crunchTue = dailyTargetFor(TUE, weekly);
  assert.ok(Math.abs(crunchTue.work - normalTue.work * scale) < 0.001);
  assert.ok(crunchTue.work > normalTue.work, 'Crunch must raise Work');
});

test('dailyTargetFor: matches expectedHours() - the formula must not drift', () => {
  // Tuesday 20:00 → Monday has passed, and Tuesday is only partly done.
  const now = at('2026-09-01', '20:00');
  const weekly = PRESETS.normal.weekly;
  const exp = expectedHours(weekly, now);
  const todayDow = logicalWeekday(now);

  for (const c of CATEGORIES) {
    let sum = 0;
    for (let i = 1; i < 8; i++) {
      const dow = i % 7;
      if (dow === todayDow) break;
      sum += dailyTargetFor(dow, weekly)[c];
    }
    // Today's pro-rated part is in `exp`, so only compare the full days.
    assert.ok(sum <= exp[c] + 0.001, `${c}: ${sum} > ${exp[c]}`);
    assert.ok(exp[c] - sum <= dailyTargetFor(todayDow, weekly)[c] + 0.001, c);
  }
});

// --- daySummary -------------------------------------------------------------

test('daySummary: no weekTarget → empty, so the UI falls back to the old line', () => {
  assert.deepEqual(daySummary(zero(), null, TUE), []);
});

test('daySummary: Sunday with no Fitness and nothing logged → Fitness hidden', () => {
  const lines = daySummary(zero(), PRESETS.normal.weekly, SUN);
  assert.equal(
    lines.find((l) => l.category === 'fitness'),
    undefined
  );
  assert.ok(lines.find((l) => l.category === 'learn'), 'Sunday must still have Learn');
});

test('daySummary: Sunday has no Fitness target but has logs → still shown', () => {
  const actual = { ...zero(), fitness: 1 };
  const line = daySummary(actual, PRESETS.normal.weekly, SUN).find(
    (l) => l.category === 'fitness'
  );
  assert.ok(line);
  assert.equal(line.target, 0);
  assert.equal(line.low, false, 'a target of 0 cannot be "short"');
});

test('daySummary: no doneBefore → the denominator is the standard, no jumping', () => {
  const actual = { ...zero(), work: 4 };
  const ls = daySummary(actual, PRESETS.normal.weekly, TUE);
  const w = ls.find((l) => l.category === 'work')!;
  assert.equal(+w.target.toFixed(2), 9.5);
  assert.equal(+w.standard.toFixed(2), 9.5);
});

test('daySummary: with doneBefore → the denominator is the catch-up suggestion, the standard stays', () => {
  const weekly = PRESETS.normal.weekly;
  // Monday had 10h of study, the standard is only 3h → Tuesday must be lighter.
  const before = { ...zero(), learn: 10 };
  const ls = daySummary(zero(), weekly, TUE, before);
  const l = ls.find((c) => c.category === 'learn')!;
  assert.equal(+l.standard.toFixed(1), 3, 'the standard does not change');
  assert.ok(l.target < l.standard, `after catching up it is lighter, target=${l.target}`);
});

test('daySummary: under 50% of target → low; met or over → not low', () => {
  const weekly = PRESETS.normal.weekly;
  const target = dailyTargetFor(TUE, weekly).work; // 9.5

  const under = daySummary({ ...zero(), work: target * LOW_RATIO - 0.1 }, weekly, TUE);
  assert.equal(under.find((l) => l.category === 'work')!.low, true);

  const onEdge = daySummary({ ...zero(), work: target * LOW_RATIO }, weekly, TUE);
  assert.equal(onEdge.find((l) => l.category === 'work')!.low, false);

  const over = daySummary({ ...zero(), work: target + 2 }, weekly, TUE);
  assert.equal(over.find((l) => l.category === 'work')!.low, false);
});
