import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deviations, expectedHours, logicalWeekday } from '@/lib/balance';
import { pickBalance } from '@/lib/banner';
import { PRESETS, type Activity } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

const WEEKLY = PRESETS.normal.weekly;

// 2026-08-31 là thứ Hai. Mốc kiểm là thứ Tư 20:41 — đúng ví dụ trong plan.
const MON = '2026-08-31';
const WED_2041 = at('2026-09-02', '20:41');

/** n giờ Work vào ngày `date`, bắt đầu 09:00. */
function block(date: string, category: Activity['category'], hours: number): Activity {
  const start = at(date, '09:00');
  return act({ category, startAt: start, endAt: start + hours * H, id: `${date}-${category}` });
}

// --- Chỗ dễ sai nhất: pro-rate theo lịch ------------------------------

test('expectedHours pro-rate THEO LỊCH, không phải weekly × ngày/7', () => {
  const byCalendar = expectedHours(WEEKLY, WED_2041);
  const naive = (WEEKLY.work * 3) / 7; // cách sai: chia đều 7 ngày

  assert.ok(
    Math.abs(byCalendar.work - naive) > 3,
    `phải lệch nhiều: lịch ${byCalendar.work.toFixed(1)}h vs chia đều ${naive.toFixed(1)}h`
  );
  assert.ok(byCalendar.work > naive, 'ngày trong tuần nặng Work hơn mức trung bình');
});

// --- Ẩn banner --------------------------------------------------------

test('không có target → ẩn hẳn banner', () => {
  assert.equal(pickBalance([], null, WED_2041), null);
});

/**
 * Một tuần đúng y kế hoạch tính tới `now`, rồi cộng/trừ ở một category.
 * Cần nền này vì nếu bỏ trống, Sleep luôn là category lệch nhiều nhất
 * và mọi test khác sẽ chỉ đo Sleep.
 */
function onPlan(now: number, tweak: Partial<Record<Activity['category'], number>> = {}) {
  const exp = expectedHours(WEEKLY, now);
  return (['work', 'learn', 'fitness', 'sleep', 'leisure'] as const).map((c) =>
    block(MON, c, Math.max(0, exp[c] + (tweak[c] ?? 0)))
  );
}

test('đi đúng kế hoạch → ẩn hẳn, KHÔNG hiện "on track"', () => {
  assert.equal(pickBalance(onPlan(WED_2041), WEEKLY, WED_2041), null);
});

test('lệch nhỏ nằm trong vùng chết → vẫn ẩn', () => {
  // Leisure lệch 42 phút: quá 25% nhưng chưa tới 2h → không báo.
  // Thiếu điều kiện 2h này thì app kêu mỗi ngày và bị tắt sau 3 hôm.
  const line = pickBalance(onPlan(WED_2041, { leisure: 0.7 }), WEEKLY, WED_2041);
  assert.equal(line, null);
});

// --- Chọn đúng một dòng ----------------------------------------------

test('chỉ trả về MỘT dòng, dù nhiều category cùng lệch', () => {
  const acts = onPlan(WED_2041, { work: 12, learn: -9, fitness: -5 });
  const line = pickBalance(acts, WEEKLY, WED_2041);
  assert.ok(line);
  assert.equal(typeof line.text, 'string');
  assert.ok(!line.text.includes('\n'), 'một dòng, không xuống dòng');
});

test('lấy deviation có |deltaHours| lớn nhất', () => {
  const acts = onPlan(WED_2041, { work: 4, learn: 11 }); // Learn lệch to hơn
  const line = pickBalance(acts, WEEKLY, WED_2041);
  assert.equal(line?.category, 'learn');
  assert.equal(line?.kind, 'over');
});

test('vượt → over, thiếu → under (không có nhánh nào khác)', () => {
  const over = pickBalance(onPlan(WED_2041, { work: 10 }), WEEKLY, WED_2041);
  assert.equal(over?.kind, 'over');
  assert.equal(over?.category, 'work');
  assert.ok(over!.deltaHours > 0);

  const under = pickBalance(onPlan(WED_2041, { learn: -8 }), WEEKLY, WED_2041);
  assert.equal(under?.kind, 'under');
  assert.equal(under?.category, 'learn');
  assert.ok(under!.deltaHours < 0);
});

test('không ghi gì cả → banner báo thiếu, chọn khoảng trống lớn nhất', () => {
  // Tới tối thứ Tư, Work là phần expected lớn nhất đã tích lại, nên nó
  // thắng Sleep. Ghi lại đây để đổi công thức là test kêu ngay.
  const line = pickBalance([], WEEKLY, WED_2041);
  assert.equal(line?.kind, 'under');
  assert.equal(line?.category, 'work');
});

// --- Xung đột cuối tuần thắng ----------------------------------------

test('xung đột cuối tuần thắng mọi deviation', () => {
  const SUN_2000 = at('2026-09-06', '20:00');
  assert.equal(logicalWeekday(at('2026-09-05', '09:00')), 6, 'phải là thứ Bảy');

  const acts = [
    block('2026-09-05', 'work', 8), // OT thứ Bảy
    block(MON, 'work', 40),
  ];
  const line = pickBalance(acts, WEEKLY, SUN_2000);
  assert.equal(line?.kind, 'conflict');
  assert.equal(line?.category, null);
  assert.ok(line!.text.includes('Learn'), 'phải nối OT với Learn còn thiếu');
});

// --- Câu chữ ----------------------------------------------------------

test('nêu số, không dạy đời', () => {
  const line = pickBalance(onPlan(WED_2041, { work: 10 }), WEEKLY, WED_2041);
  assert.match(line!.text, /^Work: \d+\.\d+h \/ \d+\.\d+h \([+-]?\d+%\)$/);
});

// --- Banner khớp với deviations() gọi trực tiếp -----------------------

test('số trên banner khớp với deviations() gọi trực tiếp', () => {
  const acts = [
    block(MON, 'work', 14),
    block('2026-09-01', 'work', 12),
    block('2026-09-01', 'learn', 1),
  ];
  const line = pickBalance(acts, WEEKLY, WED_2041);
  const direct = deviations(acts, WEEKLY, WED_2041).filter((d) => d.flag !== 'ok');

  assert.ok(line);
  const worst = direct.reduce((a, b) =>
    Math.abs(b.deltaHours) > Math.abs(a.deltaHours) ? b : a
  );
  assert.equal(line.category, worst.category);
  assert.equal(line.deltaHours, worst.deltaHours);
  assert.ok(line.text.includes(worst.actual.toFixed(1)));
  assert.ok(line.text.includes(worst.expected.toFixed(1)));
});
