import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actualHours } from '@/lib/balance';
import { bucketsOf } from '@/lib/bucket';
import { actualForRange } from '@/lib/range-target';
import type { Range } from '@/lib/range';
import { CATEGORIES, type Category } from '@/types/logi';

import { act, at } from './_helpers.ts';

// 2026-08-26 is a Wednesday, 2026-08-27 a Thursday.
const WED = '2026-08-26';
const THU = '2026-08-27';

function range(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

/** Total hours of every category in a Record. */
function sum(r: Record<Category, number>): number {
  return CATEGORIES.reduce((a, c) => a + r[c], 0);
}

/** By day: add up each column. This is the number users see on the chart. */
function byDayTotal(activities: Parameters<typeof actualForRange>[0], r: Range, now: number) {
  return bucketsOf(r, now).reduce((a, b) => a + sum(actualForRange(activities, b.range, now)), 0);
}

test('Leisure 22:00 → 01:00: all 3h go to the first logical day, no cut', () => {
  const a = act({ category: 'leisure', startAt: at(WED, '22:00'), endAt: at(THU, '01:00') });
  const now = at(THU, '12:00');

  const wed = actualForRange([a], range(WED, WED), now);
  const thu = actualForRange([a], range(THU, THU), now);

  assert.equal(wed.leisure, 3);
  assert.equal(thu.leisure, 0);
});

test('Work 23:00 → 02:00: all 3h go to the first logical day', () => {
  const a = act({ category: 'work', startAt: at(WED, '23:00'), endAt: at(THU, '02:00') });
  const now = at(THU, '12:00');

  assert.equal(actualForRange([a], range(WED, WED), now).work, 3);
  assert.equal(actualForRange([a], range(THU, THU), now).work, 0);
});

test('a session after 00:00 but before 04:00 still belongs to the previous logical day', () => {
  // 01:00 Thursday has Wednesday's logicalDate because the day mark is 04:00.
  const a = act({ category: 'learn', startAt: at(THU, '01:00'), endAt: at(THU, '03:00') });
  const now = at(THU, '12:00');

  assert.equal(actualForRange([a], range(WED, WED), now).learn, 2);
  assert.equal(actualForRange([a], range(THU, THU), now).learn, 0);
});

test('By day total = Balance total for every range', () => {
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
    range('2026-08-24', '2026-08-30'), // a whole week
    range('2026-08-01', '2026-08-31'), // a whole month, grouped by week
  ]) {
    const inRange = acts.filter((a) => a.logicalDate >= r.from && a.logicalDate <= r.to);
    const balance = sum(actualHours(inRange, now));
    assert.equal(
      byDayTotal(acts, r, now).toFixed(4),
      balance.toFixed(4),
      `range ${r.from}..${r.to}`
    );
  }
});

test('a running session: counted up to now, whole on its start logical day', () => {
  const a = act({ category: 'work', startAt: at(WED, '23:00'), endAt: null });
  const now = at(THU, '02:00');

  assert.equal(actualForRange([a], range(WED, WED), now).work, 3);
  assert.equal(actualForRange([a], range(THU, THU), now).work, 0);
});

test('abandoned and scheduled are not counted', () => {
  const now = at(THU, '12:00');
  const acts = [
    act({ category: 'work', startAt: at(WED, '09:00'), endAt: at(WED, '17:00'), status: 'abandoned' }),
    act({ category: 'learn', startAt: at(WED, '19:00'), endAt: at(WED, '20:00'), status: 'scheduled' }),
  ];

  assert.equal(sum(actualForRange(acts, range(WED, WED), now)), 0);
});
