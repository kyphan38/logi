import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  logicalDate,
  logicalWeekday,
  logicalWeek,
  overlapHours,
  findStale,
  suggestedEndTimes,
  validateTargets,
  rebalance,
  accrueDebt,
  applyDebt,
} from '@/lib/balance';
import { BASELINE_WEEKLY, TOTAL_BUDGET, CATEGORIES } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

// --- Mốc cắt ngày 04:00 (mục 9, 10 trong checklist tay) --------------

test('logicalDate: trước 04:00 vẫn là ngày hôm trước', () => {
  assert.equal(logicalDate(at('2026-08-27', '03:59')), '2026-08-26');
  assert.equal(logicalDate(at('2026-08-27', '00:30')), '2026-08-26');
});

test('logicalDate: từ 04:00 là ngày mới', () => {
  assert.equal(logicalDate(at('2026-08-27', '04:00')), '2026-08-27');
  assert.equal(logicalDate(at('2026-08-27', '22:00')), '2026-08-27');
});

test('logicalDate: 04:00 lùi qua đầu tháng', () => {
  assert.equal(logicalDate(at('2026-09-01', '02:00')), '2026-08-31');
});

test('logicalWeekday: 2026-08-26 là thứ Tư = 3', () => {
  assert.equal(logicalWeekday(at('2026-08-26', '12:00')), 3);
  // 02:00 thứ Năm vẫn thuộc ngày logic thứ Tư
  assert.equal(logicalWeekday(at('2026-08-27', '02:00')), 3);
});

test('logicalWeek theo tuần ISO của ngày logic', () => {
  assert.equal(logicalWeek(at('2026-08-26', '12:00')), '2026-W35');
  assert.equal(logicalWeek(at('2026-08-27', '02:00')), '2026-W35');
});

// --- Overlap (mục 3, 13) --------------------------------------------

test('overlapHours: hai session song song 1 giờ', () => {
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({
    id: 'b',
    category: 'learn',
    startAt: at('2026-08-26', '10:00'),
    endAt: at('2026-08-26', '12:00'),
  });
  assert.equal(overlapHours([a, b]), 1);
});

test('overlapHours: không chồng thì bằng 0', () => {
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '10:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '11:00') });
  assert.equal(overlapHours([a, b]), 0);
});

test('overlapHours: bỏ qua record abandoned', () => {
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({
    id: 'b',
    startAt: at('2026-08-26', '09:30'),
    endAt: at('2026-08-26', '10:30'),
    status: 'abandoned',
  });
  assert.equal(overlapHours([a, b]), 0);
});

test('overlapHours: session đang chạy tính tới now', () => {
  const now = at('2026-08-26', '11:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: null });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: null });
  assert.equal(overlapHours([a, b], now), 1);
});

// --- Stale session (mục 14 - bạn chưa test tay được) ------------------

test('findStale: active quá 15h là stale', () => {
  const now = at('2026-08-27', '02:00');
  const stale = act({ startAt: now - 16 * H, endAt: null });
  assert.deepEqual(findStale([stale], now).map((a) => a.id), [stale.id]);
});

test('findStale: active dưới 15h thì chưa stale', () => {
  const now = at('2026-08-26', '12:00');
  const fresh = act({ startAt: now - 14.9 * H, endAt: null });
  assert.equal(findStale([fresh], now).length, 0);
});

test('findStale: record đã done thì không bao giờ stale', () => {
  const now = at('2026-08-27', '12:00');
  const old = act({ startAt: now - 30 * H, endAt: now - 20 * H });
  assert.equal(findStale([old], now).length, 0);
});

test('suggestedEndTimes chỉ gợi ý mốc sau giờ bắt đầu', () => {
  const a = act({ category: 'work', startAt: at('2026-08-26', '18:00') });
  const s = suggestedEndTimes(a);
  assert.ok(s.length > 0);
  for (const x of s) assert.ok(x.ts > a.startAt, `${x.label} phải sau startAt`);
});

// --- Ngân sách tuần --------------------------------------------------

test('validateTargets: baseline hợp lệ', () => {
  const r = validateTargets(BASELINE_WEEKLY);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.total, TOTAL_BUDGET);
});

test('validateTargets: vượt ngân sách thì báo lỗi', () => {
  const bad = { ...BASELINE_WEEKLY, work: BASELINE_WEEKLY.work + 20 };
  assert.equal(validateTargets(bad).ok, false);
});

test('rebalance: kéo work lên vẫn giữ tổng = TOTAL_BUDGET', () => {
  const next = rebalance(BASELINE_WEEKLY, 'work', BASELINE_WEEKLY.work + 8);
  const total = CATEGORIES.reduce((s, c) => s + next[c], 0);
  assert.ok(Math.abs(total - TOTAL_BUDGET) < 0.11, `tổng = ${total}`);
  assert.equal(next.sleep, BASELINE_WEEKLY.sleep, 'sleep không bị đụng vào');
});

test('applyDebt không trả nhiều hơn số nợ', () => {
  const cut = { ...BASELINE_WEEKLY, work: BASELINE_WEEKLY.work - 5 };
  const debt = accrueDebt(cut, {});
  assert.ok(Math.abs((debt.work ?? 0) - 5) < 1e-9, 'cắt 5h work → nợ 5h');
  const { applied, remaining } = applyDebt(BASELINE_WEEKLY, debt);
  for (const c of CATEGORIES) {
    const owed = debt[c] ?? 0;
    if (owed <= 0) continue;
    assert.ok((applied[c] ?? 0) <= owed + 1e-9);
    assert.ok(Math.abs((applied[c] ?? 0) + (remaining[c] ?? 0) - owed) < 1e-9);
  }
});
