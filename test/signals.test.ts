import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expectedForRange } from '@/lib/range-target';
import type { Range } from '@/lib/range';
import {
  computeSignals,
  previousRange,
  type PreviousPeriod,
  type Signals,
} from '@/lib/signals';
import { PRESETS, type Activity, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

// Tuần 2026-W35: thứ Hai 24/08 → Chủ nhật 30/08. Chấm lúc 31/08 nên
// không ngày nào còn dở dang - số kỳ vọng tính tay được.
const MON = '2026-08-24';
const TUE = '2026-08-25';
const WED = '2026-08-26';
const THU = '2026-08-27';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30';
const NOW = at('2026-08-31', '12:00');

const WEEK: Range = { from: MON, to: SUN, kind: 'custom', isPartial: false };

const targets = new Map<string, Record<Category, number>>([
  ['2026-W34', PRESETS.normal.weekly],
  ['2026-W35', PRESETS.normal.weekly],
]);

function sig(activities: Activity[], previous?: PreviousPeriod, range: Range = WEEK): Signals {
  return computeSignals(
    activities,
    range,
    expectedForRange(range, targets, NOW),
    targets,
    previous,
    NOW
  );
}

/** Giúp đọc test: session xong xuôi từ giờ này tới giờ kia. */
function s(
  category: Category,
  date: string,
  from: string,
  to: string,
  endDate = date
): Activity {
  return act({
    id: `${category}-${date}-${from}`,
    category,
    startAt: at(date, from),
    endAt: at(endDate, to),
  });
}

const near = (a: number | null, b: number, msg?: string) =>
  assert.ok(a !== null && Math.abs(a - b) < 0.001, `${msg ?? ''} ${a} ≠ ${b}`);

// ------------------------------------------------------------
// Nhóm A - chung
// ------------------------------------------------------------

test('A: đếm session, trung vị và block dài nhất theo từng category', () => {
  const g = sig([
    s('learn', MON, '05:00', '05:20'),
    s('learn', TUE, '20:00', '21:00'),
    s('learn', WED, '20:00', '21:40'),
  ]);
  const learn = g.byCategory.learn;
  assert.equal(learn.sessions, 3);
  assert.equal(learn.medianSessionMin, 60);
  assert.equal(learn.longestBlockMin, 100);
  near(learn.actual, 20 / 60 + 1 + 100 / 60);
});

test('A: zeroDays chỉ đếm ngày đã sống, và deviationPct so với target', () => {
  const g = sig([s('learn', MON, '05:00', '07:00'), s('learn', TUE, '05:00', '07:00')]);
  assert.equal(g.dayCount, 7);
  assert.equal(g.elapsedDays, 7);
  assert.equal(g.byCategory.learn.zeroDays, 5);
  assert.equal(g.byCategory.fitness.zeroDays, 7);
  // Normal: Learn 31h/tuần. Log 4h → lệch (4 − 31)/31.
  near(g.byCategory.learn.deviationPct!, (4 - 31) / 31);
});

test('A: không có kỳ trước thì deltaVsPrevious là null, có thì ra hiệu số', () => {
  const none = sig([s('work', MON, '08:00', '12:00')]);
  assert.equal(none.byCategory.work.deltaVsPrevious, null);
  assert.equal(none.hasPrevious, false);

  const prev = previousRange(WEEK);
  assert.equal(prev.from, '2026-08-17');
  assert.equal(prev.to, '2026-08-23');

  const g = sig([s('work', MON, '08:00', '12:00')], {
    activities: [s('work', '2026-08-18', '08:00', '18:00')],
    expected: expectedForRange(prev, targets, NOW),
  });
  near(g.byCategory.work.deltaVsPrevious!, 4 - 10);
});

// ------------------------------------------------------------
// Nhóm B - Nhịp ngày (thay Sleep, AMENDMENT-remove-sleep mục 10)
// ------------------------------------------------------------

test('B: lastActivityMedian lấy giờ kết thúc muộn nhất của từng ngày', () => {
  const g = sig([
    s('work', MON, '08:00', '17:00'),
    s('learn', MON, '20:00', '21:00'), // MON kết thúc 21:00
    s('learn', TUE, '20:00', '22:00'), // TUE kết thúc 22:00
    s('leisure', WED, '20:00', '23:30'), // WED kết thúc 23:30
  ]);
  assert.equal(g.night.daysWithActivity, 3);
  // 1260, 1320, 1410 → trung vị 1320 = 22:00
  assert.equal(g.night.lastActivityMedian, 22 * 60);
  assert.equal(g.night.lastActivitySpreadMin, 1410 - 1260);
});

test('B: activity qua nửa đêm nằm trên trục ngày logic, thuộc ngày bắt đầu', () => {
  const g = sig([
    s('learn', MON, '05:00', '06:00'),
    s('leisure', MON, '22:00', '01:00', TUE),
  ]);
  // Cả hai cùng ngày logic MON: session 22:00 → 01:00 gán trọn cho MON.
  assert.equal(g.night.daysWithActivity, 1);
  // 01:00 trên trục ngày logic là 25:00 = 1500, không phải 60.
  assert.equal(g.night.lastActivityMedian, 25 * 60);
  assert.equal(g.night.lateNightActivityDays, 1);
  // Một ngày thì không có dao động.
  assert.equal(g.night.lastActivitySpreadMin, null);
});

test('B: lateNightActivityDays đếm ngày, không đếm session', () => {
  const g = sig([
    s('leisure', MON, '23:10', '23:50'),
    s('work', MON, '21:00', '23:30'), // cùng ngày → vẫn tính 1
    s('learn', TUE, '20:00', '22:00'), // dừng trước 23:00 → không tính
    s('work', WED, '22:00', '00:30', THU),
  ]);
  assert.equal(g.night.lateNightActivityDays, 2);
});

test('B: earlyStartDays đếm ngày mở màn trước 06:00', () => {
  const g = sig([
    s('learn', MON, '04:30', '06:30'),
    s('learn', TUE, '05:59', '07:00'),
    s('learn', WED, '06:00', '07:00'), // đúng mốc → không tính
    s('work', THU, '08:00', '17:00'),
  ]);
  assert.equal(g.night.earlyStartDays, 2);
});

test('B: không có log thì mọi chỉ số nhịp ngày về 0 hoặc null', () => {
  const g = sig([]);
  assert.equal(g.night.daysWithActivity, 0);
  assert.equal(g.night.lateNightActivityDays, 0);
  assert.equal(g.night.earlyStartDays, 0);
  assert.equal(g.night.lastActivityMedian, null);
  assert.equal(g.night.lastActivitySpreadMin, null);
});

// ------------------------------------------------------------
// Nhóm C - Work
// ------------------------------------------------------------

test('C: otHours chỉ tính phần ngoài 08:00–17:00 của thứ Hai–thứ Sáu', () => {
  const g = sig([
    s('work', MON, '07:00', '19:00'), // 3h ngoài khung
    s('work', SAT, '09:00', '12:00'), // cuối tuần, không vào otHours
  ]);
  near(g.work.otHours, 3);
  near(g.work.weekendWorkHours, 3);
  assert.equal(g.work.officeDaysLogged, 1);
});

test('C: lateWorkHours tính từ 20:00, kể cả phần tràn qua nửa đêm', () => {
  const g = sig([
    s('work', TUE, '18:00', '21:30'),
    s('work', THU, '19:00', '00:30', FRI),
  ]);
  // T5: 20:00–24:00 = 4h, cộng 00:00–00:30 của T6 = 0.5h.
  near(g.work.lateWorkHours, 1.5 + 4.5);
  assert.equal(g.work.officeDaysLogged, 0);
});

test('C: ngày Work dài nhất và số ngày trên 10h', () => {
  const g = sig([
    s('work', MON, '08:00', '19:00'), // 11h
    s('work', TUE, '08:00', '17:00'), // 9h
  ]);
  assert.equal(g.work.longestWorkDay!.date, MON);
  near(g.work.longestWorkDay!.hours, 11);
  assert.equal(g.work.daysOver10hWork, 1);
  // Kết thúc 19:00 và 17:00 → dao động 120 phút.
  assert.equal(g.work.workEndSpreadMin, 120);
});

// ------------------------------------------------------------
// Nhóm D - Learn
// ------------------------------------------------------------

test('D: khối sáng và khối tối tách riêng', () => {
  const g = sig([
    s('learn', TUE, '05:00', '06:30'),
    s('learn', TUE, '20:30', '22:00'),
    s('learn', WED, '09:00', '10:00'), // không thuộc khối nào
  ]);
  assert.equal(g.learn.morningLearnDays, 1);
  near(g.learn.morningLearnHours, 1.5);
  assert.equal(g.learn.eveningLearnDays, 1);
  near(g.learn.eveningLearnHours, 1.5);
  assert.equal(g.learn.longestLearnBlockMin, 90);
});

test('D: giờ học cuối tuần và target cuối tuần của preset Normal', () => {
  const g = sig([s('learn', SAT, '08:00', '12:00'), s('learn', MON, '05:00', '06:00')]);
  near(g.learn.weekendLearnHours, 4);
  near(g.learn.weekendLearnTarget, 16);
  assert.equal(g.learn.daysWithZeroLearn, 5);
});

test('D: learnStreak đứt ở ngày dưới 50% target ngày đó', () => {
  // Target Normal: ngày thường 3h (mốc 1.5h), cuối tuần 8h (mốc 4h).
  const g = sig([
    s('learn', THU, '20:00', '21:00'), // 1h < 1.5h → đứt ở đây
    s('learn', FRI, '20:00', '22:00'), // 2h ✓
    s('learn', SAT, '08:00', '12:00'), // 4h ✓
    s('learn', SUN, '08:00', '12:00'), // 4h ✓
  ]);
  assert.equal(g.learn.learnStreak, 3);
});

test('D: thứ tệ nhất cho Learn chỉ hiện khi khoảng đủ 7 ngày', () => {
  const short: Range = { from: MON, to: WED, kind: 'custom', isPartial: false };
  assert.equal(sig([], undefined, short).learn.weekdayWorstForLearn, null);

  const g = sig([
    s('learn', MON, '05:00', '07:00'),
    s('learn', TUE, '05:00', '07:00'),
    s('learn', THU, '05:00', '07:00'),
    s('learn', FRI, '05:00', '07:00'),
    s('learn', SAT, '05:00', '07:00'),
    s('learn', SUN, '05:00', '07:00'),
  ]);
  // Chỉ thứ Tư không học → thứ Tư là 3.
  assert.equal(g.learn.weekdayWorstForLearn!.weekday, 3);
  near(g.learn.weekdayWorstForLearn!.hours, 0);
});

// ------------------------------------------------------------
// Nhóm E - Fitness
// ------------------------------------------------------------

test('E: longestGapDays là số ngày cách nhau giữa hai buổi', () => {
  const g = sig([
    s('fitness', MON, '18:00', '19:00'),
    s('fitness', WED, '18:00', '19:00'),
    s('fitness', SUN, '18:00', '19:00'),
  ]);
  assert.equal(g.fitness.sessions, 3);
  // 26/08 → 30/08 là bốn ngày.
  assert.equal(g.fitness.longestGapDays, 4);
  assert.equal(g.fitness.daysSinceLast, 1);
  near(g.fitness.sessionsPerWeek, 3);
  assert.equal(g.fitness.medianSessionMin, 60);
  assert.deepEqual(g.fitness.weekdayDistribution, [1, 1, 0, 1, 0, 0, 0]);
});

test('E: skippedAfterWorkDays chỉ đếm ngày Work > 9h mà không tập', () => {
  const g = sig([
    s('work', MON, '08:00', '19:00'), // 11h, không tập
    s('work', TUE, '08:00', '19:00'), // 11h, có tập
    s('fitness', TUE, '19:30', '20:30'),
    s('work', WED, '08:00', '16:00'), // 8h, không tập → không tính
  ]);
  assert.equal(g.fitness.skippedAfterWorkDays, 1);
});

test('E: chưa tập buổi nào thì không bịa ra khoảng cách', () => {
  const g = sig([s('work', MON, '08:00', '17:00')]);
  assert.equal(g.fitness.longestGapDays, null);
  assert.equal(g.fitness.daysSinceLast, null);
  assert.equal(g.fitness.medianSessionMin, null);
});

// ------------------------------------------------------------
// Nhóm F - Leisure
// ------------------------------------------------------------

test('F: lateLeisureHours tính từ 22:00, gồm cả phần sau nửa đêm', () => {
  const g = sig([
    s('leisure', MON, '21:00', '23:30'),
    s('leisure', TUE, '23:00', '01:00', WED),
  ]);
  near(g.leisure.lateLeisureHours, 1.5 + 2);
  near(g.leisure.hours, 2.5 + 2);
  assert.equal(g.leisure.longestBlockMin, 150);
});

test('F: tách giờ giải trí ngày thường và cuối tuần', () => {
  const g = sig([s('leisure', TUE, '20:00', '21:00'), s('leisure', SAT, '14:00', '17:00')]);
  near(g.leisure.weekdayLeisureHours, 1);
  near(g.leisure.weekendLeisureHours, 3);
});

// ------------------------------------------------------------
// Nhóm G - liên hệ chéo
// ------------------------------------------------------------

test('G: dưới 3 mẫu thì trả null, không suy diễn', () => {
  const g = sig([
    s('work', MON, '08:00', '18:30'), // 10.5h
    s('work', TUE, '08:00', '18:30'),
    s('learn', MON, '20:00', '21:00'),
  ]);
  assert.equal(g.links.learnOnHighWorkDays, null);
});

test('G: đủ 3 mẫu thì có giá trị kèm sampleSize', () => {
  const g = sig([
    s('work', MON, '08:00', '18:30'),
    s('work', TUE, '08:00', '18:30'),
    s('work', WED, '08:00', '18:30'),
    s('learn', MON, '20:00', '21:00'), // 1h
    s('learn', TUE, '20:00', '20:30'), // 0.5h
    s('learn', THU, '20:00', '22:00'), // ngày Work bình thường
  ]);
  assert.equal(g.links.learnOnHighWorkDays!.sampleSize, 3);
  near(g.links.learnOnHighWorkDays!.value, 0.5);
  assert.equal(g.links.learnOnNormalDays!.sampleSize, 4);
});

test('G: ngày SAU một ngày còn hoạt động sau 23:00 mới được tính', () => {
  const g = sig([
    s('leisure', MON, '22:00', '23:30'),
    s('leisure', TUE, '22:00', '23:30'),
    s('leisure', WED, '22:00', '23:30'),
    s('learn', TUE, '05:00', '06:00'), // 1h
    s('learn', THU, '05:00', '07:00'), // 2h
  ]);
  assert.equal(g.night.lateNightActivityDays, 3);
  assert.equal(g.links.learnAfterLateNights!.sampleSize, 3);
  // Ngày sau ba ngày thức khuya: T3 1h, T4 0h, T5 2h → trung bình 1h.
  near(g.links.learnAfterLateNights!.value, 1);
});

test('G: dưới 3 ngày thức khuya thì learnAfterLateNights là null', () => {
  const g = sig([
    s('leisure', MON, '22:00', '23:30'),
    s('leisure', TUE, '22:00', '23:30'),
    s('learn', TUE, '05:00', '06:00'),
  ]);
  assert.equal(g.links.learnAfterLateNights, null);
});

test('G: displacedBy khớp với chênh lệch so với kỳ trước', () => {
  const prev = previousRange(WEEK);
  const g = sig([s('learn', MON, '08:00', '13:00'), s('work', TUE, '08:00', '10:00')], {
    activities: [
      s('learn', '2026-08-17', '08:00', '09:00'),
      s('work', '2026-08-18', '08:00', '16:00'),
    ],
    expected: expectedForRange(prev, targets, NOW),
  });
  const d = g.links.displacedBy!;
  assert.equal(d.up, 'learn');
  near(d.upHours, 4);
  assert.equal(d.down, 'work');
  near(d.downHours, -6);
  assert.equal(d.sampleSize, 7);
});

test('G: cuối tuần chỉ có 2 ngày trong một tuần → chỉ số cặp bị ẩn', () => {
  const g = sig([s('learn', SAT, '08:00', '12:00')]);
  assert.equal(g.links.weekendLearnVsWeekendWork, null);
  // Nhưng tổng giờ cuối tuần (nhóm D) vẫn còn, vì đó không phải suy diễn.
  near(g.learn.weekendLearnHours, 4);
});
