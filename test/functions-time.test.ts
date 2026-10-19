import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import * as fn from '../functions/src/time.ts';
import { at } from './_helpers.ts';

// ---------------------------------------------------------------------------
// The Cloud Function runs apart from the app, so it copies the logical-day
// rules. Any two copies drift apart - unless a test holds them together.
//
// A one-day mismatch means a push on the wrong day, or "this week" in a
// notification not matching the week shown in the app.
// ---------------------------------------------------------------------------

/** Every hour over many days, including the 04:00 mark and New Year's Eve. */
function everyHour(from: string, days: number): number[] {
  const out: number[] = [];
  const start = at(from, '00:00');
  for (let h = 0; h < days * 24; h++) out.push(start + h * 3_600_000);
  return out;
}

const SPANS = [
  ...everyHour('2026-08-24', 14), // a normal week
  ...everyHour('2026-12-28', 10), // across years: 2026-W53 → 2027-W01
  ...everyHour('2027-01-01', 7),
];

test('function logicalDate matches the app hour by hour', () => {
  for (const ts of SPANS) {
    assert.equal(fn.logicalDate(ts), logicalDate(ts), `differs at ${new Date(ts).toISOString()}`);
  }
});

test('logicalWeek matches the app, including weeks across years', () => {
  for (const ts of SPANS) {
    assert.equal(fn.logicalWeek(ts), logicalWeek(ts), `differs at ${new Date(ts).toISOString()}`);
  }
});

test('logicalWeekday matches the app - Sunday is 0 in both', () => {
  for (const ts of SPANS) {
    assert.equal(fn.logicalWeekday(ts), logicalWeekday(ts));
  }
});

test('markAt returns the right local time', () => {
  assert.equal(fn.markAt('2026-08-26', 6, 15), at('2026-08-26', '06:15'));
  assert.equal(fn.markAt('2026-08-26', 20, 45), at('2026-08-26', '20:45'));
});

test('dayStart is 04:00, not midnight', () => {
  assert.equal(fn.dayStart('2026-08-26'), at('2026-08-26', '04:00'));
});

test('03:59 still belongs to the previous day in both copies', () => {
  const ts = at('2026-08-26', '03:59');
  assert.equal(fn.logicalDate(ts), '2026-08-25');
  assert.equal(fn.logicalDate(ts), logicalDate(ts));
});
