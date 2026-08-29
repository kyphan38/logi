import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dayLogQuality,
  isThin,
  logQuality,
  logQualityLine,
} from '@/lib/log-quality';
import { act, at } from './_helpers.ts';

const DAY = '2026-08-25'; // thứ Ba
const LATER = at('2026-08-27', '12:00'); // "bây giờ" nằm ngoài ngày đang đo
const r2 = (x: number) => Math.round(x * 100) / 100;

test('một ngày, hai session liền kề → không có gap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '12:00'), category: 'work' }),
    act({ startAt: at(DAY, '12:00'), endAt: at(DAY, '17:00'), category: 'work' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 9);
  assert.equal(q.activeSpanHours, 9);
  assert.equal(q.gapHours, 0);
  assert.equal(q.gapRatio, 0);
});

test('06:00→08:00 và 09:00→17:00: tracked 10h, gap 1h, span 11h', () => {
  const acts = [
    act({ startAt: at(DAY, '06:00'), endAt: at(DAY, '08:00') }),
    act({ startAt: at(DAY, '09:00'), endAt: at(DAY, '17:00'), id: 'b' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 10);
  assert.equal(q.gapHours, 1);
  assert.equal(q.activeSpanHours, 11);
});

test('giờ trước session đầu và sau session cuối không tính vào đâu cả', () => {
  // Log 08:00-17:00. Cả đêm trước lẫn tối sau đều không phải "quên log".
  const acts = [act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00') })];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 9);
  assert.equal(q.activeSpanHours, 9);
  assert.equal(q.gapHours, 0);
});

test('khoảng trống GIỮA hai session mới được tính là gap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '10:00') }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00') }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 5);
  assert.equal(q.activeSpanHours, 9); // 08:00 → 17:00
  assert.equal(q.gapHours, 4);        // 10:00 → 14:00
  assert.equal(r2(q.gapRatio), 0.44);
});

test('overlap không tính hai lần, và không tạo gap âm', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '16:00'), category: 'learn' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 9);
  assert.equal(q.gapHours, 0);
});

test('ngày không log gì: vào totalDays, không vào activeSpanHours', () => {
  const acts = [act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00') })];
  const q = logQuality(acts, { from: DAY, to: '2026-08-27' }, LATER);
  assert.equal(q.loggedDays, 1);
  assert.equal(q.totalDays, 3);
  assert.equal(q.activeSpanHours, 9); // hai ngày trống không cộng thêm gì
  assert.equal(q.gapHours, 0);
});

test('hôm nay: mốc cuối là now, nên phần chưa log tính là gap', () => {
  const now = at('2026-08-29', '15:00');
  const acts = [act({ startAt: at('2026-08-29', '09:00'), endAt: at('2026-08-29', '11:00') })];
  const q = dayLogQuality(acts, '2026-08-29', now);
  assert.equal(q.trackedHours, 2);
  assert.equal(q.activeSpanHours, 6); // 09:00 → 15:00
  assert.equal(q.gapHours, 4);
});

test('session đang chạy: endAt null → kéo tới now', () => {
  const now = at('2026-08-29', '15:00');
  const acts = [act({ startAt: at('2026-08-29', '13:00'), endAt: null })];
  const q = dayLogQuality(acts, '2026-08-29', now);
  assert.equal(q.trackedHours, 2);
  assert.equal(q.gapHours, 0);
});

test('scheduled và abandoned không tính', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '10:00') }),
    act({ startAt: at(DAY, '11:00'), endAt: at(DAY, '12:00'), status: 'scheduled' }),
    act({ startAt: at(DAY, '13:00'), endAt: at(DAY, '14:00'), status: 'abandoned' }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(q.trackedHours, 2);
  assert.equal(q.activeSpanHours, 2);
});

test('không có gì để đo → mọi số bằng 0, không NaN', () => {
  const q = logQuality([], { from: DAY, to: DAY }, LATER);
  assert.equal(q.gapRatio, 0);
  assert.equal(q.activeSpanHours, 0);
  assert.equal(q.loggedDays, 0);
  assert.equal(q.totalDays, 1);
});

test('mỗi ngày một session 30 phút: gapRatio hoàn hảo nhưng loggedDays bịt lỗ', () => {
  // Lỗ hổng nêu ở mục 3.2: span = 30 phút, gap = 0, tỉ lệ trông 100%.
  const acts = [act({ startAt: at(DAY, '09:00'), endAt: at(DAY, '09:30') })];
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, LATER);
  assert.equal(q.gapRatio, 0);
  assert.equal(q.loggedDays, 1);
  assert.equal(q.totalDays, 7);
  assert.equal(isThin(q), true); // 1/7 < 0.6
});

test('log đều và kín → không cảnh báo', () => {
  const acts = [];
  for (let d = 24; d <= 30; d++) {
    const day = `2026-08-${d}`;
    acts.push(act({ startAt: at(day, '08:00'), endAt: at(day, '17:00') }));
  }
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, at('2026-08-31', '12:00'));
  assert.equal(q.loggedDays, 7);
  assert.equal(q.gapRatio, 0);
  assert.equal(isThin(q), false);
});

test('gapRatio quá 0.25 → cảnh báo dù log đủ 7 ngày', () => {
  const acts = [];
  for (let d = 24; d <= 30; d++) {
    const day = `2026-08-${d}`;
    acts.push(act({ startAt: at(day, '08:00'), endAt: at(day, '10:00') }));
    acts.push(act({ startAt: at(day, '16:00'), endAt: at(day, '18:00') }));
  }
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, at('2026-08-31', '12:00'));
  assert.equal(q.loggedDays, 7);
  assert.equal(r2(q.gapRatio), 0.6);
  assert.equal(isThin(q), true);
});

test('session qua nửa đêm thuộc ngày logic của startAt', () => {
  // Học 22:00 T3 → 01:00 T4 vẫn là ngày 2026-08-25 (mốc cắt 04:00).
  const acts = [act({ startAt: at(DAY, '22:00'), endAt: at('2026-08-26', '01:00') })];
  const q = dayLogQuality(acts, DAY, LATER);
  assert.equal(q.trackedHours, 3);
  assert.equal(q.gapHours, 0);
});

test('dòng tóm tắt đọc được', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '10:00') }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00') }),
  ];
  const q = logQuality(acts, { from: DAY, to: DAY }, LATER);
  assert.equal(logQualityLine(q), '5h logged · 4h gaps · 1 of 1 days');
});

test('3/7 ngày có log → cảnh báo vì tỉ lệ dưới 0.6', () => {
  const acts = [];
  for (const d of [24, 25, 26]) {
    const day = `2026-08-${d}`;
    acts.push(act({ startAt: at(day, '08:00'), endAt: at(day, '17:00'), id: `a${d}` }));
  }
  const q = logQuality(acts, { from: '2026-08-24', to: '2026-08-30' }, at('2026-08-31', '12:00'));
  assert.equal(q.loggedDays, 3);
  assert.equal(q.totalDays, 7);
  assert.equal(q.gapRatio, 0); // từng ngày kín, nhưng 4 ngày trống thì số này vô nghĩa
  assert.equal(isThin(q), true);
});

test('hôm nay: activeSpan dừng ở now, không kéo tới cuối ngày', () => {
  const now = at('2026-08-29', '15:00');
  const acts = [act({ startAt: at('2026-08-29', '09:00'), endAt: at('2026-08-29', '10:00') })];
  const q = dayLogQuality(acts, '2026-08-29', now);
  assert.equal(q.activeSpanHours, 6); // 09:00 → 15:00, KHÔNG phải 09:00 → 04:00
});
