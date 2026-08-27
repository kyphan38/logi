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

test('toLocalInput cho đúng định dạng input datetime-local', () => {
  assert.equal(toLocalInput(at('2026-08-26', '22:05')), '2026-08-26T22:05');
  assert.equal(toLocalInput(at('2026-01-02', '03:04')), '2026-01-02T03:04');
});

test('fromLocalInput là phép đảo của toLocalInput', () => {
  const ts = at('2026-08-26', '22:05');
  assert.equal(fromLocalInput(toLocalInput(ts)), ts);
});

test('fromLocalInput trả null khi rỗng hoặc sai', () => {
  assert.equal(fromLocalInput(''), null);
  assert.equal(fromLocalInput('không phải ngày'), null);
});

test('roundDown làm tròn xuống bội số 15 phút', () => {
  const base = at('2026-08-26', '10:00');
  assert.equal(roundDown(at('2026-08-26', '10:07')), base);
  assert.equal(roundDown(at('2026-08-26', '10:14')), base);
  assert.equal(roundDown(at('2026-08-26', '10:15')), at('2026-08-26', '10:15'));
  assert.equal(roundDown(base), base);
});

test('formatDuration hiển thị "3h 0m" / "45m" / không âm', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45 * 60_000), '45m');
  assert.equal(formatDuration(3 * 3_600_000), '3h 0m');
  assert.equal(formatDuration(90 * 60_000), '1h 30m');
  assert.equal(formatDuration(-5000), '0m');
});

test('shortDate có ngày trong chuỗi', () => {
  assert.match(shortDate(at('2026-08-26', '12:00')), /26/);
});

test('countdown hiện mm:ss khi dưới một giờ', () => {
  assert.equal(countdown(272_000), '4:32');
  assert.equal(countdown(59_000), '0:59');
});

test('countdown hiện h:mm:ss khi hơn một giờ', () => {
  assert.equal(countdown(3_872_000), '1:04:32');
});

test('countdown làm tròn lên và không âm', () => {
  assert.equal(countdown(4_200), '0:05');
  assert.equal(countdown(0), '0:00');
  assert.equal(countdown(-9_000), '0:00');
});
