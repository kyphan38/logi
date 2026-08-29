import assert from 'node:assert/strict';
import { test } from 'node:test';

import { customRange, type Range } from '@/lib/range';
import { coverageForRange, overlapForRange, realHoursOfRange } from '@/lib/range-target';
import { act, at } from './_helpers.ts';

const DAY = '2026-08-25'; // thứ Ba
const r2 = (x: number) => Math.round(x * 100) / 100;

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

test('khoảng 1 ngày, log 12h → 50%', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }), // 9h
    act({ startAt: at(DAY, '19:00'), endAt: at(DAY, '22:00'), category: 'learn' }), // 3h
  ];
  const cov = coverageForRange(acts, full(DAY, DAY), at('2026-08-27', '12:00'));
  assert.equal(r2(cov), 0.5);
});

test('có overlap → không tính hai lần', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00'), category: 'learn' }), // nằm gọn trong Work
  ];
  const now = at('2026-08-27', '12:00');
  const range = full(DAY, DAY);

  // Tổng thô là 12h, nhưng thời gian thực sự đã sống chỉ 9h.
  assert.equal(r2(coverageForRange(acts, range, now)), r2(9 / 24));
  assert.equal(r2(overlapForRange(acts, range, now)), 3);
});

test('ba session chồng nhau vẫn chỉ đếm phần hợp một lần', () => {
  const acts = [
    act({ id: 'a', startAt: at(DAY, '08:00'), endAt: at(DAY, '12:00'), category: 'work' }),
    act({ id: 'b', startAt: at(DAY, '09:00'), endAt: at(DAY, '11:00'), category: 'learn' }),
    act({ id: 'c', startAt: at(DAY, '10:00'), endAt: at(DAY, '10:30'), category: 'leisure' }),
  ];
  const cov = coverageForRange(acts, full(DAY, DAY), at('2026-08-27', '12:00'));
  assert.equal(r2(cov), r2(4 / 24)); // union = 08:00–12:00
});

test('hôm nay chỉ tính tới now, không tính phần tương lai', () => {
  // 10:00 → ngày logic đã trôi 6/24 giờ.
  const now = at(DAY, '10:00');
  const range: Range = { from: DAY, to: DAY, kind: 'custom', isPartial: true };

  assert.equal(r2(realHoursOfRange(range, now)), 6);

  const acts = [act({ startAt: at(DAY, '07:00'), endAt: at(DAY, '10:00'), category: 'work' })];
  assert.equal(r2(coverageForRange(acts, range, now)), 0.5); // 3h / 6h
});

test('session đang chạy chỉ tính tới now', () => {
  const now = at(DAY, '10:00');
  const range: Range = { from: DAY, to: DAY, kind: 'custom', isPartial: true };
  const acts = [act({ startAt: at(DAY, '08:00'), endAt: null, category: 'work' })];
  assert.equal(r2(coverageForRange(acts, range, now)), r2(2 / 6));
});

test('KHÔNG chia cứng cho 168 - khoảng 2 ngày mẫu số là 48h', () => {
  const range = full('2026-08-24', DAY);
  assert.equal(realHoursOfRange(range, at('2026-08-27', '12:00')), 48);

  const acts = [act({ startAt: at(DAY, '00:00'), endAt: at(DAY, '12:00'), category: 'sleep' })];
  // 12h / 48h = 25%. Nếu chia 168 thì ra 7% - sai hẳn một bậc.
  assert.equal(r2(coverageForRange(acts, range, at('2026-08-27', '12:00'))), 0.25);
});

test('phần vượt ra ngoài khoảng bị cắt, không cộng vào coverage', () => {
  // Ngủ 22:00 T2 → 06:00 T3, nhưng khoảng chỉ có ngày T2 (kết thúc 04:00 T3).
  const acts = [
    act({ startAt: at('2026-08-24', '22:00'), endAt: at(DAY, '06:00'), category: 'sleep' }),
  ];
  const cov = coverageForRange(acts, full('2026-08-24', '2026-08-24'), at('2026-08-27', '12:00'));
  assert.equal(r2(cov), r2(6 / 24)); // 22:00 → 04:00
});

test('abandoned / scheduled không tính vào coverage', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), status: 'abandoned' }),
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), status: 'scheduled', id: 's' }),
  ];
  assert.equal(coverageForRange(acts, full(DAY, DAY), at('2026-08-27', '12:00')), 0);
});

test('không log gì → 0, không NaN', () => {
  const cov = coverageForRange([], full(DAY, DAY), at('2026-08-27', '12:00'));
  assert.equal(cov, 0);
  assert.ok(Number.isFinite(cov));
});

test('coverage khoảng custom 7 ngày dùng đúng mẫu số 168h', () => {
  const res = customRange('2026-08-24', '2026-08-30', at('2026-09-05', '12:00'));
  assert.equal(realHoursOfRange(res.range!, at('2026-09-05', '12:00')), 168);
});
