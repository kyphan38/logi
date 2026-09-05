import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClockTime, toClockInput, relativeLabel } from '@/lib/clock';
import { logicalDate } from '@/lib/balance';
import { at, MIN, H } from './_helpers.ts';

// 2026-09-05 là thứ Sáu, 2026-09-06 là thứ Bảy.

test("'past' lùi về hôm qua khi giờ đó hôm nay chưa tới", () => {
  const now = at('2026-09-05', '07:30');
  assert.equal(resolveClockTime('07:15', now, 'past'), at('2026-09-05', '07:15'));
  assert.equal(resolveClockTime('23:30', now, 'past'), at('2026-09-04', '23:30'));
});

test("'future' nhảy sang mai khi giờ đó hôm nay đã qua", () => {
  const now = at('2026-09-05', '07:30');
  assert.equal(resolveClockTime('08:00', now, 'future'), at('2026-09-05', '08:00'));
  assert.equal(resolveClockTime('07:00', now, 'future'), at('2026-09-06', '07:00'));
});

test('đúng bằng now: past giữ nguyên, future nhảy sang mai', () => {
  const now = at('2026-09-05', '07:30');
  assert.equal(resolveClockTime('07:30', now, 'past'), now);
  assert.equal(resolveClockTime('07:30', now, 'future'), at('2026-09-06', '07:30'));
});

/**
 * Bốn ca vắt qua nửa đêm, kiểm luôn ngày logic của kết quả. Đây là lý do sheet
 * bedtime không cần ô chọn ngày.
 */
test('vắt qua nửa đêm rơi vào đúng ngày logic', () => {
  // Sáng T7, gõ giờ đi ngủ đêm qua.
  const satMorning = at('2026-09-05', '07:30');
  const a = resolveClockTime('23:30', satMorning, 'past')!;
  assert.equal(a, at('2026-09-04', '23:30'));
  assert.equal(logicalDate(a), '2026-09-04');

  // Cùng buổi sáng đó, gõ 01:00 - đã qua rồi, nhưng vẫn thuộc ngày logic hôm trước
  // vì mốc cắt là 04:00.
  const b = resolveClockTime('01:00', satMorning, 'past')!;
  assert.equal(b, at('2026-09-05', '01:00'));
  assert.equal(logicalDate(b), '2026-09-04');

  // Nửa đêm rồi mới nhớ ghi.
  const justAfterMidnight = at('2026-09-05', '00:30');
  const c = resolveClockTime('23:50', justAfterMidnight, 'past')!;
  assert.equal(c, at('2026-09-04', '23:50'));
  assert.equal(logicalDate(c), '2026-09-04');

  // Ghi trước khi đi ngủ, chưa qua nửa đêm.
  const lateNight = at('2026-09-05', '23:45');
  const d = resolveClockTime('23:30', lateNight, 'past')!;
  assert.equal(d, at('2026-09-05', '23:30'));
  assert.equal(logicalDate(d), '2026-09-05');
});

test('quanh mốc cắt ngày 04:00', () => {
  assert.equal(
    resolveClockTime('03:59', at('2026-09-05', '04:00'), 'past'),
    at('2026-09-05', '03:59')
  );
  assert.equal(
    resolveClockTime('04:00', at('2026-09-05', '03:59'), 'past'),
    at('2026-09-04', '04:00')
  );
});

test('hai đầu mút của một ngày', () => {
  const noon = at('2026-09-05', '12:00');
  assert.equal(resolveClockTime('00:00', noon, 'past'), at('2026-09-05', '00:00'));
  assert.equal(resolveClockTime('23:59', noon, 'past'), at('2026-09-04', '23:59'));
  assert.equal(resolveClockTime('00:00', noon, 'future'), at('2026-09-06', '00:00'));
});

test('nhận cả "7:15" lẫn "07:15"', () => {
  const now = at('2026-09-05', '12:00');
  assert.equal(resolveClockTime('7:15', now, 'past'), resolveClockTime('07:15', now, 'past'));
});

test('đầu vào rác trả về null, không ném lỗi', () => {
  const now = at('2026-09-05', '12:00');
  for (const bad of ['', '   ', '7:5', '25:00', '12:60', 'ab:cd', '12', '12:00:00', '-1:00']) {
    assert.equal(resolveClockTime(bad, now, 'past'), null, `"${bad}" phải là null`);
  }
});

test('toClockInput ra định dạng 24h có số 0 đứng đầu', () => {
  assert.equal(toClockInput(at('2026-09-05', '07:05')), '07:05');
  assert.equal(toClockInput(at('2026-09-05', '23:30')), '23:30');
  assert.equal(toClockInput(at('2026-09-05', '00:00')), '00:00');
});

test('toClockInput khứ hồi được với resolveClockTime', () => {
  const now = at('2026-09-05', '12:00');
  const ts = at('2026-09-05', '07:15');
  assert.equal(resolveClockTime(toClockInput(ts), now, 'past'), ts);
});

test('relativeLabel nói cả hai chiều', () => {
  const now = at('2026-09-05', '12:00');
  assert.equal(relativeLabel(now - 15 * MIN, now), '15m ago');
  assert.equal(relativeLabel(now - 8 * H - 2 * MIN, now), '8h 2m ago');
  assert.equal(relativeLabel(now + 30 * MIN, now), 'in 30m');
  assert.equal(relativeLabel(now, now), 'just now');
  assert.equal(relativeLabel(now - 30_000, now), 'just now');
});
