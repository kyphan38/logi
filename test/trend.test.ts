import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SPAN,
  TREND_SPANS,
  elapsedFraction,
  hasLogged,
  spanWeeks,
  trendBuckets,
  trendCompare,
  trendWindow,
  type TrendPoint,
} from '@/lib/trend';
import { weekDiff } from '@/lib/week';
import { at } from './_helpers.ts';

// Monday 2026-08-31, 12:00. Logical week: 2026-W36.
const NOW = at('2026-08-31', '12:00');

// ---------------------------------------------------------------------------
// spanWeeks
// ---------------------------------------------------------------------------

test('TREND_SPANS is weeks only, default 6w', () => {
  assert.deepEqual(
    TREND_SPANS.map((s) => s.value),
    ['6w', '12w', '26w']
  );
  assert.ok(TREND_SPANS.some((s) => s.value === DEFAULT_SPAN));
  assert.equal(DEFAULT_SPAN, '6w');
});

test('spanWeeks reads the week count', () => {
  assert.equal(spanWeeks('6w'), 6);
  assert.equal(spanWeeks('12w'), 12);
  assert.equal(spanWeeks('26w'), 26);
});

test('trendBuckets gives the right column count, old → new, last column is the current period', () => {
  for (const s of TREND_SPANS) {
    const b = trendBuckets(s.value, NOW);
    assert.equal(b.length, spanWeeks(s.value));
    assert.equal(b[b.length - 1].partial, true);
    assert.equal(b.slice(0, -1).every((x) => x.partial === false), true);
    // week keys, no month keys
    assert.ok(b.every((x) => /^\d{4}-W\d{2}$/.test(x.key)));
    // old → new
    for (let i = 1; i < b.length; i++) assert.ok(b[i].range.from > b[i - 1].range.from);
  }
});

test('26w: first column is exactly 25 weeks before the last', () => {
  const b = trendBuckets('26w', NOW);
  assert.equal(b.length, 26);
  assert.equal(weekDiff(b[0].key, b[25].key), 25);
});

// ---------------------------------------------------------------------------
// trendBuckets - weeks
// ---------------------------------------------------------------------------

test('6 weeks = exactly 6 columns, the last is THIS WEEK', () => {
  const b = trendBuckets('6w', NOW);
  assert.equal(b.length, 6);
  assert.equal(b[5].key, '2026-W36');
  assert.equal(b[5].partial, true, 'this week is not done');
  assert.equal(b[0].partial, false);
  assert.equal(b[4].partial, false);
});

test('week columns are continuous, no skips and no repeats', () => {
  const keys = trendBuckets('6w', NOW).map((b) => b.key);
  assert.deepEqual(keys, ['2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W36']);
});

test('each week column is 7 days, except the current one stops at TODAY', () => {
  const b = trendBuckets('6w', NOW);
  assert.equal(b[0].range.from, '2026-07-27');
  assert.equal(b[0].range.to, '2026-08-02');
  // The last column does not run to Sunday: days not lived yet cannot be measured.
  assert.equal(b[5].range.from, '2026-08-31');
  assert.equal(b[5].range.to, '2026-08-31');
});

// ---------------------------------------------------------------------------
// trendWindow - one query covers every column
// ---------------------------------------------------------------------------

test('trendWindow spans from the first column to the last', () => {
  for (const span of ['6w', '12w', '26w'] as const) {
    const b = trendBuckets(span, NOW);
    const w = trendWindow(b);
    assert.equal(w.from, b[0].range.from, `${span} from`);
    assert.equal(w.to, b[b.length - 1].range.to, `${span} to`);
    for (const x of b) {
      assert.ok(x.range.from >= w.from && x.range.to <= w.to, `${span}: ${x.key} falls outside`);
    }
  }
});

// ---------------------------------------------------------------------------
// elapsedFraction - the target of the current column must shrink to match
// ---------------------------------------------------------------------------

test('a finished column always counts 100% of target', () => {
  const b = trendBuckets('6w', NOW);
  assert.equal(elapsedFraction(b[0], NOW), 1);
});

test('this week only past Monday → about 1/7 of target, not the whole week', () => {
  const b = trendBuckets('6w', NOW);
  const f = elapsedFraction(b[5], NOW);
  assert.ok(f > 0 && f <= 0.2, `f = ${f}`);
});

test('elapsedFraction never exceeds 1 - a partial column cannot outweigh a full one', () => {
  for (const span of ['6w', '12w', '26w'] as const) {
    for (const b of trendBuckets(span, NOW)) {
      const f = elapsedFraction(b, NOW);
      assert.ok(f > 0 && f <= 1, `${span}/${b.key} = ${f}`);
    }
  }
});

// ---------------------------------------------------------------------------
// An empty period ≠ a zero period
//
// Old bug: the chart read "W31 0.0h → W35 7.3h · up +7.3h" when the app was
// not in use yet in W31.
// ---------------------------------------------------------------------------

const W36 = { from: '2026-08-31', to: '2026-09-06' };

const logged = (date: string, status = 'done') => ({ status, startAt: at(date, '09:00') });

const pt = (label: string, hours: number | null, partial = false): TrendPoint => ({
  label,
  hours,
  partial,
});

test('hasLogged - a period with a real session has data', () => {
  assert.equal(hasLogged([logged('2026-09-02')], W36), true);
});

test('hasLogged - a session outside the period does not count', () => {
  assert.equal(hasLogged([logged('2026-08-30'), logged('2026-09-07')], W36), false);
});

test('hasLogged - abandoned and scheduled are NOT data', () => {
  const acts = [logged('2026-09-02', 'abandoned'), logged('2026-09-03', 'scheduled')];
  assert.equal(hasLogged(acts, W36), false);
});

test('hasLogged - an empty period is empty, so it draws a null column, not 0', () => {
  assert.equal(hasLogged([], W36), false);
});

test('weeks without data are left out of the comparison line', () => {
  // W31..W33 are empty, only W34 and W35 have logs.
  const cmp = trendCompare([
    pt('W31', null),
    pt('W32', null),
    pt('W33', null),
    pt('W34', 5),
    pt('W35', 7.3),
  ]);
  assert.ok(cmp);
  assert.equal(cmp.from.label, 'W34');
  assert.equal(cmp.to.label, 'W35');
  assert.equal(Math.round(cmp.diff * 10) / 10, 2.3);
  assert.equal(cmp.word, 'up');
});

test('fewer than 2 weeks with data → hide the comparison line', () => {
  assert.equal(trendCompare([pt('W34', null), pt('W35', 7.3)]), null);
  assert.equal(trendCompare([]), null);
});

test('an empty week is NOT 0 hours - no fake spike', () => {
  const cmp = trendCompare([pt('W31', null), pt('W35', 7.3), pt('W36', 7.0)]);
  assert.ok(cmp);
  assert.equal(cmp.from.label, 'W35');
  assert.equal(cmp.word, 'flat');
});

test('the current period is never the end point - half a week always looks like a drop', () => {
  const cmp = trendCompare([pt('W34', 6), pt('W35', 7), pt('W36', 1, true)]);
  assert.ok(cmp);
  assert.equal(cmp.to.label, 'W35');
});

test('a change under 0.5h is flat, not a trend', () => {
  const cmp = trendCompare([pt('W34', 7.0), pt('W35', 7.4)]);
  assert.equal(cmp?.word, 'flat');
});

test('going down gives a negative diff', () => {
  const cmp = trendCompare([pt('W34', 9), pt('W35', 4)]);
  assert.equal(cmp?.word, 'down');
  assert.equal(cmp?.diff, -5);
});
