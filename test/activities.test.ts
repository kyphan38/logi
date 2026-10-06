import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  derive,
  validateTimes,
  assertCategory,
  isStaleScheduled,
  statusForTimes,
  SCHEDULED_MAX_AGE_MS,
  ActivityError,
} from '@/lib/activities';
import { act, at, H } from './_helpers.ts';

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ActivityError, `must be an ActivityError, got ${e}`);
    return (e as ActivityError).code;
  }
  assert.fail('must throw');
}

test('derive: durationMin rounds to minutes, null while running', () => {
  const start = at('2026-08-26', '09:00');
  assert.equal(derive(start, start + 90 * 60_000).durationMin, 90);
  assert.equal(derive(start, null).durationMin, null);
});

test('derive: logicalDate / logicalWeek always come from startAt', () => {
  const start = at('2026-08-27', '02:00'); // after midnight → still the 26th
  const d = derive(start, at('2026-08-27', '06:00'));
  assert.equal(d.logicalDate, '2026-08-26');
  assert.equal(d.logicalWeek, '2026-W35');
});

test('validateTimes: valid times do not throw', () => {
  const now = at('2026-08-26', '12:00');
  assert.doesNotThrow(() => validateTimes(now - 2 * H, now - H, 'done', now));
  assert.doesNotThrow(() => validateTimes(now - 2 * H, null, 'active', now));
});

test('validateTimes: end before start → end-before-start', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - H, now - 2 * H, 'done', now)), 'end-before-start');
});

test('validateTimes: end equal to start is blocked too', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - H, now - H, 'done', now)), 'end-before-start');
});

test('validateTimes: a session over 15h → too-long', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - 16 * H, now, 'done', now)), 'too-long');
  assert.doesNotThrow(() => validateTimes(now - 14 * H, now, 'done', now));
});

test('validateTimes: more than 7 days back → too-old', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - 8 * 24 * H, now - 8 * 24 * H + H, 'done', now)), 'too-old');
});

test('validateTimes: a start time in the future → future', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now + 2 * H, null, 'active', now)), 'future');
});

test('validateTimes: a scheduled record may be in the future', () => {
  const now = at('2026-08-26', '12:00');
  assert.doesNotThrow(() => validateTimes(now + 2 * H, now + 3 * H, 'scheduled', now));
});

test('validateTimes: a non-number startAt → end-before-start (invalid)', () => {
  const now = at('2026-08-26', '12:00');
  assert.throws(() => validateTimes(NaN, now, 'done', now), ActivityError);
});

// ------------------------------------------------------------
// endAt and status always go together
// ------------------------------------------------------------

test('statusForTimes: endAt on a running session → done', () => {
  assert.equal(statusForTimes(at('2026-08-29', '00:00'), 'active'), 'done');
});

test('statusForTimes: scheduled with an endAt → done', () => {
  assert.equal(statusForTimes(at('2026-08-29', '00:00'), 'scheduled'), 'done');
});

test('statusForTimes: clearing endAt of a done record → running again (Undo)', () => {
  assert.equal(statusForTimes(null, 'done'), 'active');
});

test('statusForTimes: abandoned stays, end time or not', () => {
  assert.equal(statusForTimes(at('2026-08-29', '00:00'), 'abandoned'), 'abandoned');
  assert.equal(statusForTimes(null, 'abandoned'), 'abandoned');
});

test('statusForTimes: running with no endAt changes nothing', () => {
  assert.equal(statusForTimes(null, 'active'), 'active');
});

test('assertCategory blocks unknown categories', () => {
  assert.doesNotThrow(() => assertCategory('work'));
  assert.equal(codeOf(() => assertCategory('cooking')), 'bad-category');
});

// ------------------------------------------------------------
// Overdue bookings (Stage 6 Task 5)
// ------------------------------------------------------------

const NOW = at('2026-08-26', '10:00');
const scheduled = (startAt: number) => act({ id: 's', startAt, endAt: null, status: 'scheduled' });

test('a booking over 7 days old → counts as dropped', () => {
  assert.equal(isStaleScheduled(scheduled(NOW - SCHEDULED_MAX_AGE_MS - 1), NOW), true);
});

test('exactly 7 days is not dropped yet - the boundary must be clear', () => {
  assert.equal(isStaleScheduled(scheduled(NOW - SCHEDULED_MAX_AGE_MS), NOW), false);
});

test('yesterday\'s booking not yet promoted is kept', () => {
  assert.equal(isStaleScheduled(scheduled(NOW - 24 * H), NOW), false);
});

test('a booking for next week is not cleaned up', () => {
  assert.equal(isStaleScheduled(scheduled(NOW + 6 * 24 * H), NOW), false);
});

test('only scheduled records are cleaned - done sessions are untouched', () => {
  const old = act({ id: 'd', startAt: NOW - 30 * 24 * H, endAt: NOW - 29 * 24 * H });
  assert.equal(isStaleScheduled(old, NOW), false);
});
