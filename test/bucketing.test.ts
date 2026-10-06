import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bucketMode, bucketsOf, MAX_DAY_COLUMNS } from '@/lib/bucket';
import { buildRange, type Range } from '@/lib/range';
import { at } from './_helpers.ts';

const NOW = at('2026-09-20', '12:00'); // well past every range below

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

test('14 days → one column per day', () => {
  const range = full('2026-08-17', '2026-08-30'); // exactly 14 days
  assert.equal(bucketMode(range), 'day');

  const b = bucketsOf(range, NOW);
  assert.equal(b.length, 14);
  assert.equal(b[0].label, 'Mon 17');
  assert.equal(b[0].range.from, '2026-08-17');
  assert.equal(b[0].range.to, '2026-08-17');
});

test('15 days → one column per week', () => {
  const range = full('2026-08-17', '2026-08-31'); // 15 days
  assert.equal(bucketMode(range), 'week');

  const b = bucketsOf(range, NOW);
  assert.equal(b.length, 3); // W34, W35, W36 (1 day each)
  assert.deepEqual(
    b.map((x) => x.days),
    [7, 7, 1]
  );
});

test('the threshold sits exactly at 14', () => {
  assert.equal(MAX_DAY_COLUMNS, 14);
});

test('weeks at both ends are cut at the range edges', () => {
  // Starts mid W35 (Wednesday) and ends mid W36 (Tuesday).
  const range = full('2026-08-26', '2026-09-08');
  assert.equal(bucketMode(range), 'day'); // 14 days

  const wide = full('2026-08-26', '2026-09-15');
  const wb = bucketsOf(wide, NOW);
  assert.equal(wb[0].range.from, '2026-08-26'); // NOT stepped back to Monday
  assert.equal(wb[0].days, 5); // T4..CN
  assert.equal(wb[wb.length - 1].range.to, '2026-09-15');
});

test('week labels are W-numbers, day labels have the weekday', () => {
  const week = bucketsOf(full('2026-08-17', '2026-09-30'), NOW);
  assert.match(week[0].label, /^W\d{2}$/);

  const day = bucketsOf(full('2026-08-24', '2026-08-26'), NOW);
  assert.equal(day[1].label, 'Tue 25');
});

test('only the column holding today is unfinished', () => {
  const now = at('2026-08-26', '16:00');
  const range = buildRange('this_week', now); // Mon 24 → today 26
  const b = bucketsOf(range, now);

  assert.equal(b.length, 3);
  assert.equal(b[0].range.isPartial, false); // Mon
  assert.equal(b[1].range.isPartial, false); // Tue
  assert.equal(b[2].range.isPartial, true); // today
});

test('a closed range has no unfinished column', () => {
  const now = at('2026-09-02', '10:00');
  const range = buildRange('last_week', now);
  const b = bucketsOf(range, now);
  assert.equal(b.length, 7);
  assert.ok(b.every((x) => x.range.isPartial === false));
});

test('a one-day range → exactly one column', () => {
  const b = bucketsOf(full('2026-08-24', '2026-08-24'), NOW);
  assert.equal(b.length, 1);
  assert.equal(b[0].days, 1);
});

test('92 days (the upper limit) still gives a readable column count', () => {
  const b = bucketsOf(full('2026-06-01', '2026-08-31'), NOW);
  assert.equal(bucketMode(full('2026-06-01', '2026-08-31')), 'week');
  assert.ok(b.length <= 14, `columns = ${b.length}`);
});
