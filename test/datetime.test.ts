import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toLocalInput,
  fromLocalInput,
  roundDown,
  formatDuration,
  shortDate,
  countdown,
} from '@/lib/datetime';
import { at } from './_helpers.ts';

test('toLocalInput gives the datetime-local input format', () => {
  assert.equal(toLocalInput(at('2026-08-26', '22:05')), '2026-08-26T22:05');
  assert.equal(toLocalInput(at('2026-01-02', '03:04')), '2026-01-02T03:04');
});

test('fromLocalInput is the inverse of toLocalInput', () => {
  const ts = at('2026-08-26', '22:05');
  assert.equal(fromLocalInput(toLocalInput(ts)), ts);
});

test('fromLocalInput returns null when empty or invalid', () => {
  assert.equal(fromLocalInput(''), null);
  assert.equal(fromLocalInput('not a date'), null);
});

test('roundDown rounds down to a multiple of 15 minutes', () => {
  const base = at('2026-08-26', '10:00');
  assert.equal(roundDown(at('2026-08-26', '10:07')), base);
  assert.equal(roundDown(at('2026-08-26', '10:14')), base);
  assert.equal(roundDown(at('2026-08-26', '10:15')), at('2026-08-26', '10:15'));
  assert.equal(roundDown(base), base);
});

test('formatDuration shows "3h 0m" / "45m" / never negative', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45 * 60_000), '45m');
  assert.equal(formatDuration(3 * 3_600_000), '3h 0m');
  assert.equal(formatDuration(90 * 60_000), '1h 30m');
  assert.equal(formatDuration(-5000), '0m');
});

test('shortDate includes the day', () => {
  assert.match(shortDate(at('2026-08-26', '12:00')), /26/);
});

test('countdown shows mm:ss under an hour', () => {
  assert.equal(countdown(272_000), '4:32');
  assert.equal(countdown(59_000), '0:59');
});

test('countdown shows h:mm:ss over an hour', () => {
  assert.equal(countdown(3_872_000), '1:04:32');
});

test('countdown rounds up and is never negative', () => {
  assert.equal(countdown(4_200), '0:05');
  assert.equal(countdown(0), '0:00');
  assert.equal(countdown(-9_000), '0:00');
});
