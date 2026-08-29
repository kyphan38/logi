import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Range } from '@/lib/range';
import { overlapForRange } from '@/lib/range-target';
import { act, at } from './_helpers.ts';

// logi - Overlap giờ (AMENDMENT-remove-sleep mục 3.2)
//
// `coverage()` đã bị xoá - không còn chia cho 24h/ngày nữa. Cái còn lại đáng đo
// là overlap: giờ bị đếm hai lần vì hai activity chồng nhau.

const DAY = '2026-08-25'; // thứ Ba
const LATER = at('2026-08-27', '12:00');
const r2 = (x: number) => Math.round(x * 100) / 100;

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

test('không chồng nhau → overlap 0', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '19:00'), endAt: at(DAY, '22:00'), category: 'learn' }),
  ];
  assert.equal(overlapForRange(acts, full(DAY, DAY), LATER), 0);
});

test('một session nằm gọn trong session kia → overlap đúng bằng nó', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00'), category: 'learn' }),
  ];
  assert.equal(r2(overlapForRange(acts, full(DAY, DAY), LATER)), 3);
});

test('ba session chồng nhau: phần hợp chỉ đếm một lần', () => {
  const acts = [
    act({ id: 'a', startAt: at(DAY, '08:00'), endAt: at(DAY, '12:00'), category: 'work' }),
    act({ id: 'b', startAt: at(DAY, '09:00'), endAt: at(DAY, '11:00'), category: 'learn' }),
    act({ id: 'c', startAt: at(DAY, '10:00'), endAt: at(DAY, '10:30'), category: 'leisure' }),
  ];
  // Tổng thô 4 + 2 + 0.5 = 6.5h, hợp lại chỉ 4h → overlap 2.5h.
  assert.equal(r2(overlapForRange(acts, full(DAY, DAY), LATER)), 2.5);
});

test('phần vượt ra ngoài khoảng bị cắt', () => {
  // Cả hai kéo sang ngày sau, nhưng khoảng dừng ở 04:00 ngày 26.
  const acts = [
    act({ startAt: at(DAY, '22:00'), endAt: at('2026-08-26', '06:00'), category: 'work' }),
    act({ startAt: at(DAY, '23:00'), endAt: at('2026-08-26', '06:00'), category: 'learn' }),
  ];
  // Cửa sổ 23:00 → 04:00 là 5h chồng nhau.
  assert.equal(r2(overlapForRange(acts, full(DAY, DAY), LATER)), 5);
});

test('session đang chạy chỉ tính tới now', () => {
  const now = at(DAY, '10:00');
  const range: Range = { from: DAY, to: DAY, kind: 'custom', isPartial: true };
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: null, category: 'work' }),
    act({ startAt: at(DAY, '09:00'), endAt: null, category: 'learn', id: 'b' }),
  ];
  assert.equal(r2(overlapForRange(acts, range, now)), 1);
});

test('abandoned / scheduled không tạo overlap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), category: 'work' }),
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), status: 'abandoned', id: 's' }),
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), status: 'scheduled', id: 't' }),
  ];
  assert.equal(overlapForRange(acts, full(DAY, DAY), LATER), 0);
});

test('không log gì → 0, không NaN', () => {
  const v = overlapForRange([], full(DAY, DAY), LATER);
  assert.equal(v, 0);
  assert.ok(Number.isFinite(v));
});
