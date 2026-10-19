import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClockTime, resolveClockOnDate, toClockInput, relativeLabel } from '@/lib/clock';
import { logicalDate } from '@/lib/balance';
import { at, MIN, H } from './_helpers.ts';

// 2026-09-05 is a Friday, 2026-09-06 a Saturday.

test("'past' steps back to yesterday when that time has not come today", () => {
  const now = at('2026-09-05', '07:30');
  assert.equal(resolveClockTime('07:15', now, 'past'), at('2026-09-05', '07:15'));
  assert.equal(resolveClockTime('23:30', now, 'past'), at('2026-09-04', '23:30'));
});

test("'future' jumps to tomorrow when that time has passed today", () => {
  const now = at('2026-09-05', '07:30');
  assert.equal(resolveClockTime('08:00', now, 'future'), at('2026-09-05', '08:00'));
  assert.equal(resolveClockTime('07:00', now, 'future'), at('2026-09-06', '07:00'));
});

test('exactly now: past stays, future jumps to tomorrow', () => {
  const now = at('2026-09-05', '07:30');
  assert.equal(resolveClockTime('07:30', now, 'past'), now);
  assert.equal(resolveClockTime('07:30', now, 'future'), at('2026-09-06', '07:30'));
});

/**
 * Four cases crossing midnight, also checking the result's logical day. This is
 * why the bedtime sheet needs no date field.
 */
test('crossing midnight lands on the right logical day', () => {
  // Saturday morning, typing last night's bedtime.
  const satMorning = at('2026-09-05', '07:30');
  const a = resolveClockTime('23:30', satMorning, 'past')!;
  assert.equal(a, at('2026-09-04', '23:30'));
  assert.equal(logicalDate(a), '2026-09-04');

  // The same morning, typing 01:00 - already passed, but still the previous
  // logical day since the cut is 04:00.
  const b = resolveClockTime('01:00', satMorning, 'past')!;
  assert.equal(b, at('2026-09-05', '01:00'));
  assert.equal(logicalDate(b), '2026-09-04');

  // Remembered to log only after midnight.
  const justAfterMidnight = at('2026-09-05', '00:30');
  const c = resolveClockTime('23:50', justAfterMidnight, 'past')!;
  assert.equal(c, at('2026-09-04', '23:50'));
  assert.equal(logicalDate(c), '2026-09-04');

  // Logged before bed, before midnight.
  const lateNight = at('2026-09-05', '23:45');
  const d = resolveClockTime('23:30', lateNight, 'past')!;
  assert.equal(d, at('2026-09-05', '23:30'));
  assert.equal(logicalDate(d), '2026-09-05');
});

test('around the 04:00 day cut', () => {
  assert.equal(
    resolveClockTime('03:59', at('2026-09-05', '04:00'), 'past'),
    at('2026-09-05', '03:59')
  );
  assert.equal(
    resolveClockTime('04:00', at('2026-09-05', '03:59'), 'past'),
    at('2026-09-04', '04:00')
  );
});

test('both ends of a day', () => {
  const noon = at('2026-09-05', '12:00');
  assert.equal(resolveClockTime('00:00', noon, 'past'), at('2026-09-05', '00:00'));
  assert.equal(resolveClockTime('23:59', noon, 'past'), at('2026-09-04', '23:59'));
  assert.equal(resolveClockTime('00:00', noon, 'future'), at('2026-09-06', '00:00'));
});

test('accepts both "7:15" and "07:15"', () => {
  const now = at('2026-09-05', '12:00');
  assert.equal(resolveClockTime('7:15', now, 'past'), resolveClockTime('07:15', now, 'past'));
});

test('junk input returns null, does not throw', () => {
  const now = at('2026-09-05', '12:00');
  for (const bad of ['', '   ', '7:5', '25:00', '12:60', 'ab:cd', '12', '12:00:00', '-1:00']) {
    assert.equal(resolveClockTime(bad, now, 'past'), null, `"${bad}" must be null`);
  }
});

test('toClockInput gives 24h format with a leading zero', () => {
  assert.equal(toClockInput(at('2026-09-05', '07:05')), '07:05');
  assert.equal(toClockInput(at('2026-09-05', '23:30')), '23:30');
  assert.equal(toClockInput(at('2026-09-05', '00:00')), '00:00');
});

test('toClockInput round-trips with resolveClockTime', () => {
  const now = at('2026-09-05', '12:00');
  const ts = at('2026-09-05', '07:15');
  assert.equal(resolveClockTime(toClockInput(ts), now, 'past'), ts);
});

test('relativeLabel speaks both directions', () => {
  const now = at('2026-09-05', '12:00');
  assert.equal(relativeLabel(now - 15 * MIN, now), '15m ago');
  assert.equal(relativeLabel(now - 8 * H - 2 * MIN, now), '8h 2m ago');
  assert.equal(relativeLabel(now + 30 * MIN, now), 'in 30m');
  assert.equal(relativeLabel(now, now), 'just now');
  assert.equal(relativeLabel(now - 30_000, now), 'just now');
});

// --- resolveClockOnDate: the day is given, not guessed ---------------------

test('times after 04:00 stay on that night\'s calendar day', () => {
  assert.equal(resolveClockOnDate('23:30', '2026-09-05'), at('2026-09-05', '23:30'));
  assert.equal(resolveClockOnDate('22:00', '2026-09-05'), at('2026-09-05', '22:00'));
});

test('times before 04:00 fall on the next calendar day - still that night', () => {
  assert.equal(resolveClockOnDate('01:00', '2026-09-05'), at('2026-09-06', '01:00'));
  assert.equal(resolveClockOnDate('00:00', '2026-09-05'), at('2026-09-06', '00:00'));
});

test('04:00 is the edge: it stays, 03:59 moves to the next day', () => {
  assert.equal(resolveClockOnDate('04:00', '2026-09-05'), at('2026-09-05', '04:00'));
  assert.equal(resolveClockOnDate('03:59', '2026-09-05'), at('2026-09-06', '03:59'));
});

test('the result always belongs to the requested logical day', () => {
  // This is the function's only promise: History saves to the viewed day, not
  // a neighboring night.
  for (const hhmm of ['22:00', '23:00', '00:00', '01:00', '03:59', '04:00', '12:00']) {
    const ts = resolveClockOnDate(hhmm, '2026-09-05');
    assert.notEqual(ts, null);
    assert.equal(logicalDate(ts as number), '2026-09-05', hhmm);
  }
});

test('across month and year edges', () => {
  assert.equal(resolveClockOnDate('00:30', '2026-09-30'), at('2026-10-01', '00:30'));
  assert.equal(resolveClockOnDate('00:30', '2026-12-31'), at('2027-01-01', '00:30'));
  assert.equal(logicalDate(resolveClockOnDate('00:30', '2026-12-31') as number), '2026-12-31');
});

test('this function is needed beyond 24 hours - old days can still be logged', () => {
  const ts = resolveClockOnDate('23:15', '2026-08-11');
  assert.equal(ts, at('2026-08-11', '23:15'));
  assert.equal(logicalDate(ts as number), '2026-08-11');
});

test('a malformed time → null', () => {
  for (const bad of ['', 'nope', '25:00', '07:60', '7:5', '07-15']) {
    assert.equal(resolveClockOnDate(bad, '2026-09-05'), null, bad);
  }
});

test('a malformed or nonexistent day → null', () => {
  for (const bad of ['', 'nope', '2026-9-5', '2026-13-01', '2026-00-10', '2026-09-31', '2026-02-30']) {
    assert.equal(resolveClockOnDate('23:00', bad), null, bad);
  }
});
