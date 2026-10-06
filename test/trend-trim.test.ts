import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_BARS,
  MIN_TREND_BUCKETS,
  chartKind,
  labelInterval,
  onTrackPct,
  trendCompare,
  trimLeadingEmpty,
  type TrendPoint,
} from '@/lib/trend';

// ---------------------------------------------------------------------------
// trimLeadingEmpty - "26 weeks" means AT MOST 26 weeks
// ---------------------------------------------------------------------------

const has = (b: { d: boolean }) => b.d;
const mk = (...flags: boolean[]) => flags.map((d, i) => ({ i, d }));

test('cuts empty periods at the start', () => {
  const out = trimLeadingEmpty(mk(false, false, false, true, true, true), has);
  assert.deepEqual(out.map((b) => b.i), [3, 4, 5]);
});

test('KEEPS empty periods in the middle - those are real weeks off', () => {
  const out = trimLeadingEmpty(mk(false, true, false, false, true, true), has);
  assert.deepEqual(out.map((b) => b.i), [1, 2, 3, 4, 5]);
});

test('no empty periods at the start → unchanged', () => {
  const out = trimLeadingEmpty(mk(true, true, true, true), has);
  assert.equal(out.length, 4);
});

test('no period has data → empty array', () => {
  assert.deepEqual(trimLeadingEmpty(mk(false, false, false), has), []);
  assert.deepEqual(trimLeadingEmpty([], has), []);
});

test('gives back periods to reach the floor when it cuts too much', () => {
  // only the last period has data → cutting all leaves 1 column, which looks like a render bug
  const out = trimLeadingEmpty(mk(false, false, false, false, false, true), has);
  assert.equal(out.length, MIN_TREND_BUCKETS);
  assert.deepEqual(out.map((b) => b.i), [3, 4, 5]);
});

test('an array shorter than the floor is kept whole, no made-up columns', () => {
  const out = trimLeadingEmpty(mk(false, true), has);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((b) => b.i), [0, 1]);
});

// ---------------------------------------------------------------------------
// chartKind / labelInterval - drawing style depends on COLUMN COUNT
// ---------------------------------------------------------------------------

test('bar up to 13 columns, line above 13', () => {
  assert.equal(chartKind(1), 'bars');
  assert.equal(chartKind(MAX_BARS), 'bars');
  assert.equal(chartKind(MAX_BARS + 1), 'line');
  assert.equal(chartKind(26), 'line');
});

test('X axis labels thin out exactly when it switches to line', () => {
  assert.equal(labelInterval(MAX_BARS), 0);
  assert.equal(labelInterval(MAX_BARS + 1), 3);
});

// ---------------------------------------------------------------------------
// onTrackPct - missing data is not zero data
// ---------------------------------------------------------------------------

test('onTrackPct: 100% means exactly on target', () => {
  assert.equal(onTrackPct(6, 6), 100);
  assert.equal(onTrackPct(3, 6), 50);
  assert.equal(onTrackPct(9, 6), 150);
  assert.equal(onTrackPct(0, 6), 0);
});

test('onTrackPct: no data or no target → null, NOT 0', () => {
  assert.equal(onTrackPct(null, 6), null);
  assert.equal(onTrackPct(5, 0), null);
  assert.equal(onTrackPct(5, -1), null);
  assert.equal(onTrackPct(null, 0), null);
});

// ---------------------------------------------------------------------------
// trendCompare: the "flat" threshold depends on the unit
// ---------------------------------------------------------------------------

const pt = (label: string, hours: number | null, partial = false): TrendPoint => ({
  label,
  hours,
  partial,
});

test('the default 0.5h threshold keeps the old behavior', () => {
  assert.equal(trendCompare([pt('W34', 7.0), pt('W35', 7.3)])?.word, 'flat');
  assert.equal(trendCompare([pt('W34', 7.0), pt('W35', 9.0)])?.word, 'up');
});

test('percent unit uses a 5 point threshold', () => {
  assert.equal(trendCompare([pt('W34', 100), pt('W35', 103)], 5)?.word, 'flat');
  assert.equal(trendCompare([pt('W34', 100), pt('W35', 120)], 5)?.word, 'up');
  assert.equal(trendCompare([pt('W34', 100), pt('W35', 80)], 5)?.word, 'down');
});

test('fewer than 2 usable periods → no comparison, silence beats guessing', () => {
  assert.equal(trendCompare([pt('W35', 7, true)], 5), null);
  assert.equal(trendCompare([pt('W34', null), pt('W35', 7)], 5), null);
});
