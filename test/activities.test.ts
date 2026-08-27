import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive, validateTimes, assertCategory, ActivityError } from '@/lib/activities';
import { at, H } from './_helpers.ts';

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ActivityError, `phải là ActivityError, nhận ${e}`);
    return (e as ActivityError).code;
  }
  assert.fail('phải ném lỗi');
}

test('derive: durationMin làm tròn phút, null khi đang chạy', () => {
  const start = at('2026-08-26', '09:00');
  assert.equal(derive(start, start + 90 * 60_000).durationMin, 90);
  assert.equal(derive(start, null).durationMin, null);
});

test('derive: logicalDate / logicalWeek luôn lấy theo startAt', () => {
  const start = at('2026-08-27', '02:00'); // sau nửa đêm → vẫn là ngày 26
  const d = derive(start, at('2026-08-27', '06:00'));
  assert.equal(d.logicalDate, '2026-08-26');
  assert.equal(d.logicalWeek, '2026-W35');
});

test('validateTimes: giờ hợp lệ thì không ném lỗi', () => {
  const now = at('2026-08-26', '12:00');
  assert.doesNotThrow(() => validateTimes(now - 2 * H, now - H, 'done', now));
  assert.doesNotThrow(() => validateTimes(now - 2 * H, null, 'active', now));
});

test('validateTimes: end trước start → end-before-start', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - H, now - 2 * H, 'done', now)), 'end-before-start');
});

test('validateTimes: end trùng start cũng bị chặn', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - H, now - H, 'done', now)), 'end-before-start');
});

test('validateTimes: session dài quá 15h → too-long', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - 16 * H, now, 'done', now)), 'too-long');
  assert.doesNotThrow(() => validateTimes(now - 14 * H, now, 'done', now));
});

test('validateTimes: lùi quá 7 ngày → too-old', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now - 8 * 24 * H, now - 8 * 24 * H + H, 'done', now)), 'too-old');
});

test('validateTimes: giờ bắt đầu ở tương lai → future', () => {
  const now = at('2026-08-26', '12:00');
  assert.equal(codeOf(() => validateTimes(now + 2 * H, null, 'active', now)), 'future');
});

test('validateTimes: record scheduled được phép ở tương lai', () => {
  const now = at('2026-08-26', '12:00');
  assert.doesNotThrow(() => validateTimes(now + 2 * H, now + 3 * H, 'scheduled', now));
});

test('validateTimes: startAt không phải số → end-before-start (invalid)', () => {
  const now = at('2026-08-26', '12:00');
  assert.throws(() => validateTimes(NaN, now, 'done', now), ActivityError);
});

test('assertCategory chặn category lạ', () => {
  assert.doesNotThrow(() => assertCategory('work'));
  assert.equal(codeOf(() => assertCategory('cooking')), 'bad-category');
});
