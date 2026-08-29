import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actualHours } from '@/lib/balance';
import { bucketsOf } from '@/lib/bucket';
import { actualForRange } from '@/lib/range-target';
import type { Range } from '@/lib/range';
import { CATEGORIES, type Category } from '@/types/logi';

import { act, at } from './_helpers.ts';

// 2026-08-26 là thứ Tư, 2026-08-27 thứ Năm.
const WED = '2026-08-26';
const THU = '2026-08-27';

function range(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

/** Tổng giờ của mọi category trong một Record. */
function sum(r: Record<Category, number>): number {
  return CATEGORIES.reduce((a, c) => a + r[c], 0);
}

/** By day: cộng từng cột lại. Đây là con số người dùng thấy trên chart. */
function byDayTotal(activities: Parameters<typeof actualForRange>[0], r: Range, now: number) {
  return bucketsOf(r, now).reduce((a, b) => a + sum(actualForRange(activities, b.range, now)), 0);
}

test('Leisure 22:00 → 01:00: toàn bộ 3h vào ngày logic đầu, không cắt', () => {
  const a = act({ category: 'leisure', startAt: at(WED, '22:00'), endAt: at(THU, '01:00') });
  const now = at(THU, '12:00');

  const wed = actualForRange([a], range(WED, WED), now);
  const thu = actualForRange([a], range(THU, THU), now);

  assert.equal(wed.leisure, 3);
  assert.equal(thu.leisure, 0);
});

test('Work 23:00 → 02:00: toàn bộ 3h vào ngày logic đầu', () => {
  const a = act({ category: 'work', startAt: at(WED, '23:00'), endAt: at(THU, '02:00') });
  const now = at(THU, '12:00');

  assert.equal(actualForRange([a], range(WED, WED), now).work, 3);
  assert.equal(actualForRange([a], range(THU, THU), now).work, 0);
});

test('session sau 00:00 nhưng trước 04:00 vẫn thuộc ngày logic hôm trước', () => {
  // 01:00 thứ Năm có logicalDate là thứ Tư vì mốc ngày là 04:00.
  const a = act({ category: 'learn', startAt: at(THU, '01:00'), endAt: at(THU, '03:00') });
  const now = at(THU, '12:00');

  assert.equal(actualForRange([a], range(WED, WED), now).learn, 2);
  assert.equal(actualForRange([a], range(THU, THU), now).learn, 0);
});

test('tổng By day = tổng Balance ở mọi khoảng', () => {
  const acts = [
    act({ category: 'work', startAt: at(WED, '09:00'), endAt: at(WED, '17:00') }),
    act({ category: 'leisure', startAt: at(WED, '22:00'), endAt: at(THU, '01:00') }),
    act({ category: 'learn', startAt: at(THU, '08:00'), endAt: at(THU, '10:30') }),
    act({ category: 'fitness', startAt: at(THU, '18:00'), endAt: at(THU, '19:00') }),
  ];
  const now = at('2026-08-28', '12:00');

  for (const r of [
    range(WED, WED),
    range(WED, THU),
    range('2026-08-24', '2026-08-30'), // cả tuần
    range('2026-08-01', '2026-08-31'), // cả tháng, gộp theo tuần
  ]) {
    const inRange = acts.filter((a) => a.logicalDate >= r.from && a.logicalDate <= r.to);
    const balance = sum(actualHours(inRange, now));
    assert.equal(
      byDayTotal(acts, r, now).toFixed(4),
      balance.toFixed(4),
      `khoảng ${r.from}..${r.to}`
    );
  }
});

test('session đang chạy: tính tới now, vẫn trọn vẹn ở ngày logic bắt đầu', () => {
  const a = act({ category: 'work', startAt: at(WED, '23:00'), endAt: null });
  const now = at(THU, '02:00');

  assert.equal(actualForRange([a], range(WED, WED), now).work, 3);
  assert.equal(actualForRange([a], range(THU, THU), now).work, 0);
});

test('abandoned và scheduled không được tính', () => {
  const now = at(THU, '12:00');
  const acts = [
    act({ category: 'work', startAt: at(WED, '09:00'), endAt: at(WED, '17:00'), status: 'abandoned' }),
    act({ category: 'learn', startAt: at(WED, '19:00'), endAt: at(WED, '20:00'), status: 'scheduled' }),
  ];

  assert.equal(sum(actualForRange(acts, range(WED, WED), now)), 0);
});
