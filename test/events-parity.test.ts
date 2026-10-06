import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logicalDate } from '@/lib/balance';
import * as app from '@/lib/events';
import * as fn from '../functions/src/events.ts';
import { at } from './_helpers.ts';

// ---------------------------------------------------------------------------
// The Cloud Function cannot import app code, so `functions/src/events.ts` is a
// hand copy. Any two copies drift apart eventually - unless a test holds them
// together.
//
// A mismatch here means the Lock Screen notification says one thing and the
// in-app list another. Or worse: push on the wrong day.
// ---------------------------------------------------------------------------

/** Every hour over many days, including the 04:00 mark and New Year's Eve. */
function everyHour(from: string, days: number): number[] {
  const out: number[] = [];
  const start = at(from, '00:00');
  for (let h = 0; h < days * 24; h++) out.push(start + h * 3_600_000);
  return out;
}

const NOWS = [
  ...everyHour('2026-10-08', 10),
  ...everyHour('2026-12-28', 8), // across New Year
  ...everyHour('2028-02-26', 5), // a leap year
];

const DATES = [
  '2026-10-15',
  '2026-10-09',
  '2026-11-01',
  '2027-01-01',
  '2028-02-29',
  '2028-03-01',
];

test('daysBetween matches hour by hour, including across 04:00', () => {
  for (const now of NOWS) {
    const today = logicalDate(now);
    for (const d of DATES) {
      assert.equal(
        fn.daysBetween(today, d),
        app.daysUntil(d, now),
        `differs at ${d} / ${new Date(now).toISOString()}`
      );
    }
  }
});

test('countdownText matches char for char, from -400 to 400 days', () => {
  for (let n = -400; n <= 400; n++) {
    assert.equal(fn.countdownText(n), app.countdownText(n), `differs at ${n} days`);
  }
});

test('dateLabel matches over a whole year', () => {
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 366; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    assert.equal(fn.dateLabel(d), app.dateLabel(d), `differs at ${d}`);
  }
});

test('MILESTONES are the same in both copies', () => {
  assert.deepEqual([...fn.MILESTONES], [14, 7, 3, 1, 0]);
  for (let n = -5; n <= 20; n++) {
    assert.equal(fn.isMilestone(n), app.isMilestone(n), `differs at ${n}`);
  }
});

test('whenLabel matches, with and without a time', () => {
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 366; i += 7) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    for (const time of [null, '00:00', '06:30', '11:30', '23:59']) {
      assert.equal(fn.whenLabel(d, time), app.whenLabel(d, time), `differs at ${d} ${time}`);
    }
  }
});
