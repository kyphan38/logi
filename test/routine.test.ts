// ---------------------------------------------------------------------------
// Stage 10 - Routine: checklist hằng ngày theo thứ.
//
// Bài test quan trọng nhất: đúng mục hiện đúng thứ, và thứ tính theo NGÀY
// LOGIC (cắt 04:00). 01:00 sáng thứ Ba vẫn phải thấy checklist của thứ Hai.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logicalDate, logicalWeekday } from '@/lib/balance';
import {
  cleanDays,
  cleanText,
  daysLabel,
  itemsForDay,
  moveItem,
  removeItem,
  routineForDay,
  upsertItem,
} from '@/lib/routine';
import type { RoutineGroup, RoutineItem } from '@/types/logi';

import { at } from './_helpers.ts';

const item = (id: string, days: number[]): RoutineItem => ({ id, text: id, days });

function group(id: string, items: RoutineItem[]): RoutineGroup {
  return { id, title: id, order: 0, items, archivedAt: null, createdAt: 0, updatedAt: 0 };
}

const exercise = group('exercise', [item('a', [1]), item('b', [1, 3, 5]), item('d', [2])]);
const it_ = group('it', [item('docker', [1]), item('ssh', [2])]);
const none = () => false;

describe('itemsForDay / routineForDay', () => {
  it('shows only items that include the weekday, in group order', () => {
    assert.deepEqual(itemsForDay(exercise, 1).map((i) => i.id), ['a', 'b']);
    assert.deepEqual(itemsForDay(exercise, 2).map((i) => i.id), ['d']);
  });

  it('hides a group with nothing on that day', () => {
    const wed = routineForDay([exercise, it_], 3, none);
    assert.deepEqual(wed.map((g) => g.group.id), ['exercise']);
    assert.deepEqual(routineForDay([exercise, it_], 0, none), []);
  });

  it('counts only visible items as done', () => {
    // `ssh` được tick nhưng hôm nay là thứ Hai - không được đếm.
    const checked = new Set(['a', 'ssh']);
    const mon = routineForDay([exercise, it_], 1, (id) => checked.has(id));
    assert.equal(mon[0].done, 1);
    assert.equal(mon[1].done, 0);
    assert.equal(mon[1].items.length, 1);
  });

  it('forgets a tick for an item removed from the template', () => {
    const g = group('g', removeItem([item('x', [1]), item('y', [1])], 'x'));
    const [day] = routineForDay([g], 1, (id) => id === 'x');
    assert.equal(day.done, 0);
    assert.equal(day.items.length, 1);
  });
});

describe('day boundary (04:00)', () => {
  it('01:00 on Tuesday still reads Monday', () => {
    const t = at('2026-09-29', '01:00'); // thứ Ba
    assert.equal(logicalDate(t), '2026-09-28');
    assert.equal(logicalWeekday(t), 1);
  });

  it('04:00 on Tuesday starts a fresh day', () => {
    const t = at('2026-09-29', '04:00');
    assert.equal(logicalDate(t), '2026-09-29');
    assert.equal(logicalWeekday(t), 2);
  });
});

describe('editing', () => {
  it('upsert adds a new item at the end and cleans it', () => {
    const next = upsertItem([item('a', [1])], { id: 'n', text: '  Plank   60s ', days: [5, 1, 1, 9] });
    assert.deepEqual(next[1], { id: 'n', text: 'Plank 60s', days: [1, 5] });
  });

  it('upsert edits in place', () => {
    const next = upsertItem([item('a', [1]), item('b', [2])], { id: 'a', text: 'A', days: [0] });
    assert.deepEqual(next.map((i) => i.id), ['a', 'b']);
    assert.deepEqual(next[0].days, [0]);
  });

  it('move skips items of other days', () => {
    // Thứ Hai thấy a, c. `b` thuộc thứ Ba nằm xen giữa.
    const list = [item('a', [1]), item('b', [2]), item('c', [1])];
    assert.deepEqual(moveItem(list, 'c', -1, 1).map((i) => i.id), ['c', 'b', 'a']);
    assert.deepEqual(moveItem(list, 'c', -1, null).map((i) => i.id), ['a', 'c', 'b']);
  });

  it('move at the edge returns the same array', () => {
    const list = [item('a', [1]), item('b', [1])];
    assert.equal(moveItem(list, 'a', -1, 1), list);
    assert.equal(moveItem(list, 'b', 1, 1), list);
  });
});

describe('labels', () => {
  it('cleanDays orders Mon → Sun', () => {
    assert.deepEqual(cleanDays([0, 6, 1, 3]), [1, 3, 6, 0]);
  });

  it('daysLabel names common sets', () => {
    assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Every day');
    assert.equal(daysLabel([1, 2, 3, 4, 5]), 'Weekdays');
    assert.equal(daysLabel([6, 0]), 'Weekends');
    assert.equal(daysLabel([5, 1, 3]), 'Mon, Wed, Fri');
    assert.equal(daysLabel([]), 'No day');
  });

  it('cleanText trims and caps length', () => {
    assert.equal(cleanText('  a   b  '), 'a b');
    assert.equal(cleanText('x'.repeat(200)).length, 80);
  });
});
