import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PRESETS } from '@/lib/balance';
import { buildRange, customRange, weekOf, type Range } from '@/lib/range';
import { expectedForRange } from '@/lib/range-target';
import type { Category } from '@/types/logi';
import { at } from './_helpers.ts';

// 2026-08-24 is a Monday, 2026-08-28 is a Friday.
const MON = '2026-08-24';
const FRI = '2026-08-28';
const SUN = '2026-08-30';

const NORMAL = PRESETS.normal.weekly;
const CRUNCH = PRESETS.crunch.weekly;

function map(...pairs: [string, Record<Category, number>][]) {
  return new Map(pairs);
}

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------
// The most important test here
// ---------------------------------------------------------------------------

test('Mon→Fri Normal preset → Work 43h, NOT 30.7h (even split)', () => {
  const range = full(MON, FRI);
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), at(SUN, '12:00'));

  // 8.0 + 9.5 + 8.0 + 9.5 + 8.0 - Tue/Thu add 1.5h commute.
  assert.equal(r1(exp.work), 43);

  // The trap: 43 × 5/7 = 30.7h. If this number shows up, the algorithm is wrong.
  assert.notEqual(r1(exp.work), 30.7);
});

test('full week Mon→Sun → exactly the weekly target', () => {
  const exp = expectedForRange(full(MON, SUN), map([weekOf(MON), NORMAL]), at('2026-09-01', '12:00'));
  for (const c of Object.keys(NORMAL) as Category[]) {
    assert.equal(r1(exp[c]), r1(NORMAL[c]), c);
  }
});

test('weekend has no Work / no Sunday Fitness', () => {
  const sat = full('2026-08-29', '2026-08-29');
  const sun = full(SUN, SUN);
  const now = at('2026-09-01', '12:00');
  const wTargets = map([weekOf(MON), NORMAL]);

  assert.equal(r1(expectedForRange(sat, wTargets, now).work), 0);
  assert.equal(r1(expectedForRange(sun, wTargets, now).fitness), 0);
  assert.equal(r1(expectedForRange(sat, wTargets, now).fitness), 1.5);
});

// ---------------------------------------------------------------------------
// Each week has its own target
// ---------------------------------------------------------------------------

test('range across two weeks with different presets → sum of both parts', () => {
  const wA = weekOf(MON);          // 2026-W35
  const wB = weekOf('2026-08-31'); // 2026-W36
  const targets = map([wA, CRUNCH], [wB, NORMAL]);
  const now = at('2026-09-14', '12:00');

  const a = expectedForRange(full(MON, SUN), targets, now);
  const b = expectedForRange(full('2026-08-31', '2026-09-06'), targets, now);
  const both = expectedForRange(full(MON, '2026-09-06'), targets, now);

  for (const c of Object.keys(NORMAL) as Category[]) {
    assert.equal(r1(both[c]), r1(a[c] + b[c]), c);
  }
  // Crunch (57h) + Normal (43h) - not the same set twice.
  assert.equal(r1(both.work), 100);
});

test('does NOT reuse one weekTarget for a range across weeks', () => {
  const wA = weekOf(MON);
  const wB = weekOf('2026-08-31');
  const mixed = expectedForRange(full(MON, '2026-09-06'), map([wA, CRUNCH], [wB, NORMAL]), at('2026-09-14', '12:00'));
  const allCrunch = expectedForRange(full(MON, '2026-09-06'), map([wA, CRUNCH], [wB, CRUNCH]), at('2026-09-14', '12:00'));

  assert.notEqual(r1(mixed.work), r1(allCrunch.work));
  assert.equal(r1(allCrunch.work), 114);
});

test('week without weekTarget → falls back to PRESETS.normal', () => {
  const range = full(MON, FRI);
  const empty = expectedForRange(range, new Map(), at(SUN, '12:00'));
  const explicit = expectedForRange(range, map([weekOf(MON), NORMAL]), at(SUN, '12:00'));

  assert.equal(r1(empty.work), 43);
  for (const c of Object.keys(NORMAL) as Category[]) {
    assert.equal(r1(empty[c]), r1(explicit[c]), c);
  }
});

test('only the missing week falls back to Normal, others keep their target', () => {
  const wA = weekOf(MON);
  const exp = expectedForRange(full(MON, '2026-09-06'), map([wA, CRUNCH]), at('2026-09-14', '12:00'));
  assert.equal(r1(exp.work), 57 + 43);
});

// ---------------------------------------------------------------------------
// Pro-rate: only today, only when isPartial
// ---------------------------------------------------------------------------

test('isPartial mid-day → only the target for today is cut by dayProgress', () => {
  // 16:00 Wed 2026-08-26. Logical day starts at 04:00 → 12/24 has passed.
  const now = at('2026-08-26', '16:00');
  const range: Range = { from: MON, to: '2026-08-26', kind: 'this_week', isPartial: true };
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);

  // Mon (8.0) + Tue (9.5) full, Wed (8.0) only half → 21.5
  assert.equal(r1(exp.work), 21.5);
});

test('isPartial = false → today keeps its full target (Last week is not cut)', () => {
  const now = at('2026-08-26', '16:00');
  const range: Range = { from: MON, to: '2026-08-26', kind: 'custom', isPartial: false };
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), 25.5); // 8 + 9.5 + 8
});

test('does NOT pro-rate past days', () => {
  // now is 16:00 today, but the range ended yesterday.
  const now = at('2026-08-26', '16:00');
  const range: Range = { from: MON, to: '2026-08-25', kind: 'custom', isPartial: false };
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), 17.5); // 8 + 9.5, not multiplied by 0.5
});

test('one-day custom at 02:00 → the previous day, 22/24 hours passed', () => {
  const now = at('2026-08-27', '02:00'); // logical day is still 2026-08-26 (Wed)
  // There is no `today` chip; a single day goes through `customRange`.
  const range = customRange('2026-08-26', '2026-08-26', now).range!;
  assert.equal(range.from, '2026-08-26');
  assert.equal(range.to, '2026-08-26');
  assert.ok(range.isPartial);

  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), r1(8 * (22 / 24)));
});

// ---------------------------------------------------------------------------
// Wired to the real chips
// ---------------------------------------------------------------------------

test('Last week is always a full week, no pro-rate', () => {
  const now = at('2026-09-02', '10:00'); // Wednesday of W36
  const range = buildRange('last_week', now);
  assert.equal(range.from, MON);
  assert.equal(range.to, SUN);
  assert.equal(range.isPartial, false);

  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), 43);
});

test('This week mid-week → range stops at today and is pro-rated', () => {
  const now = at('2026-08-26', '16:00');
  const range = buildRange('this_week', now);
  assert.equal(range.from, MON);
  assert.equal(range.to, '2026-08-26');
  assert.ok(range.isPartial);
});

test('range > 92 days is capped', () => {
  const now = at('2026-08-26', '16:00');
  assert.equal(customRange('2026-01-01', '2026-08-26', now).range, null);
  assert.match(customRange('2026-01-01', '2026-08-26', now).error!, /max 3 months/);
  assert.ok(customRange('2026-06-01', '2026-08-26', now).range);
});

test('reversed dates are swapped', () => {
  const res = customRange(FRI, MON, at('2026-09-10', '12:00'));
  assert.equal(res.range?.from, MON);
  assert.equal(res.range?.to, FRI);
});
