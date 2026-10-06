import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dayLogQuality,
  isThin,
  logQuality,
  logQualityLine,
} from '@/lib/log-quality';
import { act, at } from './_helpers.ts';

const DAY = '2026-08-25'; // a Tuesday
const LATER = at('2026-08-27', '12:00'); // "now" is outside the measured day
const r2 = (x: number) => Math.round(x * 100) / 100;

test('one day, two back-to-back sessions → no gap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '12:00'), category: 'work' }),
    act({ startAt: at(DAY, '12:00'), endAt: at(DAY, '17:00'), category: 'work' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 9);
  assert.equal(q.activeSpanHours, 9);
  assert.equal(q.gapHours, 0);
  assert.equal(q.gapRatio, 0);
});

test('06:00→08:00 and 09:00→17:00: tracked 10h, gap 1h, span 11h', () => {
  const acts = [
    act({ startAt: at(DAY, '06:00'), endAt: at(DAY, '08:00') }),
    act({ startAt: at(DAY, '09:00'), endAt: at(DAY, '17:00'), id: 'b' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 10);
  assert.equal(q.gapHours, 1);
  assert.equal(q.activeSpanHours, 11);
});

test('time before the first and after the last session counts nowhere', () => {
  // Logged 08:00-17:00. Neither the night before nor the evening after is "forgot to log".
  const acts = [act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00') })];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 9);
  assert.equal(q.activeSpanHours, 9);
  assert.equal(q.gapHours, 0);
});

test('only the space BETWEEN two sessions counts as a gap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '10:00') }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00') }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 5);
  assert.equal(q.activeSpanHours, 9); // 08:00 → 17:00
  assert.equal(q.gapHours, 4);        // 10:00 → 14:00
  assert.equal(r2(q.gapRatio), 0.44);
});

test('overlap is not counted twice and makes no negative gap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '16:00'), category: 'learn' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 9);
  assert.equal(q.gapHours, 0);
});

test('a day with no logs: counts in totalDays, not in activeSpanHours', () => {
  const acts = [act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00') })];
  const q = logQuality(acts, { from: DAY, to: '2026-08-27' }, LATER);
  assert.equal(q.loggedDays, 1);
  assert.equal(q.totalDays, 3);
  assert.equal(q.activeSpanHours, 9); // the two empty days add nothing
  assert.equal(q.gapHours, 0);
});

test('today: the end mark is now, so the unlogged part counts as gap', () => {
  const now = at('2026-08-29', '15:00');
  const acts = [act({ startAt: at('2026-08-29', '09:00'), endAt: at('2026-08-29', '11:00') })];
  const q = dayLogQuality(acts, '2026-08-29', now);
  assert.equal(q.trackedHours, 2);
  assert.equal(q.activeSpanHours, 6); // 09:00 → 15:00
  assert.equal(q.gapHours, 4);
});

test('running session: endAt null → extends to now', () => {
  const now = at('2026-08-29', '15:00');
  const acts = [act({ startAt: at('2026-08-29', '13:00'), endAt: null })];
  const q = dayLogQuality(acts, '2026-08-29', now);
  assert.equal(q.trackedHours, 2);
  assert.equal(q.gapHours, 0);
});

test('scheduled and abandoned do not count', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '10:00') }),
    act({ startAt: at(DAY, '11:00'), endAt: at(DAY, '12:00'), status: 'scheduled' }),
    act({ startAt: at(DAY, '13:00'), endAt: at(DAY, '14:00'), status: 'abandoned' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 2);
  assert.equal(q.activeSpanHours, 2);
});

test('nothing to measure → all numbers 0, no NaN', () => {
  const q = logQuality([], { from: DAY, to: DAY }, LATER);
  assert.equal(q.gapRatio, 0);
  assert.equal(q.activeSpanHours, 0);
  assert.equal(q.loggedDays, 0);
  assert.equal(q.totalDays, 1);
});

test('one 30-min session a day: perfect gapRatio, but loggedDays closes the hole', () => {
  // The hole: span = 30 min, gap = 0, so the ratio looks like 100%.
  const acts = [act({ startAt: at(DAY, '09:00'), endAt: at(DAY, '09:30') })];
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, LATER);
  assert.equal(q.gapRatio, 0);
  assert.equal(q.loggedDays, 1);
  assert.equal(q.totalDays, 7);
  assert.equal(isThin(q), true); // 1/7 < 0.6
});

test('steady, complete logs → no warning', () => {
  const acts = [];
  for (let d = 24; d <= 30; d++) {
    const day = `2026-08-${d}`;
    acts.push(act({ startAt: at(day, '08:00'), endAt: at(day, '17:00') }));
  }
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, at('2026-08-31', '12:00'));
  assert.equal(q.loggedDays, 7);
  assert.equal(q.gapRatio, 0);
  assert.equal(isThin(q), false);
});

test('gapRatio over 0.25 → warning even with all 7 days logged', () => {
  const acts = [];
  for (let d = 24; d <= 30; d++) {
    const day = `2026-08-${d}`;
    acts.push(act({ startAt: at(day, '08:00'), endAt: at(day, '10:00') }));
    acts.push(act({ startAt: at(day, '16:00'), endAt: at(day, '18:00') }));
  }
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, at('2026-08-31', '12:00'));
  assert.equal(q.loggedDays, 7);
  assert.equal(r2(q.gapRatio), 0.6);
  assert.equal(isThin(q), true);
});

test('a session past midnight belongs to the logical day of startAt', () => {
  // Study 22:00 Tue → 01:00 Wed is still 2026-08-25 (04:00 cutoff).
  const acts = [act({ startAt: at(DAY, '22:00'), endAt: at('2026-08-26', '01:00') })];
  const q = dayLogQuality(acts, DAY, LATER);
  assert.equal(q.trackedHours, 3);
  assert.equal(q.gapHours, 0);
});

test('the summary line is readable', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '10:00') }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00') }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(logQualityLine(q), '5h logged · 4h gaps · 1 of 1 days');
});

test('3/7 days logged → warning since the ratio is under 0.6', () => {
  const acts = [];
  for (const d of [24, 25, 26]) {
    const day = `2026-08-${d}`;
    acts.push(act({ startAt: at(day, '08:00'), endAt: at(day, '17:00'), id: `a${d}` }));
  }
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, at('2026-08-31', '12:00'));
  assert.equal(q.loggedDays, 3);
  assert.equal(q.totalDays, 7);
  assert.equal(q.gapRatio, 0); // each day is full, but with 4 empty days this number means nothing
  assert.equal(isThin(q), true);
});

test('today: activeSpan stops at now, not at the end of the day', () => {
  const now = at('2026-08-29', '15:00');
  const acts = [act({ startAt: at('2026-08-29', '09:00'), endAt: at('2026-08-29', '10:00') })];
  const q = dayLogQuality(acts, '2026-08-29', now);
  assert.equal(q.activeSpanHours, 6); // 09:00 → 15:00, NOT 09:00 → 04:00
});
