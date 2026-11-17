import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NowTile } from '@/lib/day-progress';
import { routineLine, showsTodayWord, summaryRows, tomorrowEvents } from '@/lib/day-summary';
import type { RoutineDayGroup } from '@/lib/routine';
import type { EventItem } from '@/types/logi';

const tile = (category: NowTile['category'], actual: number, target: number): NowTile => ({
  category,
  actual,
  target,
  fill: 0,
  over: false,
  noTarget: target === 0,
  label: '',
});

describe('summaryRows', () => {
  it('keeps categories with hours or a target', () => {
    const rows = summaryRows([tile('learn', 2, 3), tile('work', 0, 0), tile('fitness', 1, 0), tile('leisure', 0, 1)]);
    assert.deepEqual(rows.map((r) => r.category), ['learn', 'fitness', 'leisure']);
  });
  it('marks a met target', () => {
    const [learn, fitness] = summaryRows([tile('learn', 3, 3), tile('fitness', 1, 0)]);
    assert.equal(learn.met, true);
    assert.equal(learn.target, '3.0h');
    assert.equal(fitness.target, null);
    assert.equal(fitness.met, false);
  });
});

describe('routineLine', () => {
  const g = (items: number, done: number) => ({ items: Array.from({ length: items }), done }) as unknown as RoutineDayGroup;
  it('counts done items across groups', () => {
    assert.equal(routineLine([g(3, 1), g(2, 2)]), '3 of 5');
  });
  it('is null with no routine', () => {
    assert.equal(routineLine([]), null);
  });
});

describe('tomorrowEvents', () => {
  const ev = (id: string, date: string, time: string | null) => ({ id, title: id, date, time }) as EventItem;
  it('keeps only the next day, timed first', () => {
    const list = tomorrowEvents([ev('a', '2026-11-18', null), ev('b', '2026-11-18', '09:00'), ev('c', '2026-11-19', '08:00')], '2026-11-17');
    assert.deepEqual(list.map((e) => e.id), ['b', 'a']);
  });
});

describe('showsTodayWord', () => {
  it('shows from 20:00 to 04:00', () => {
    assert.equal(showsTodayWord(new Date(2026, 10, 17, 19, 59).getTime()), false);
    assert.equal(showsTodayWord(new Date(2026, 10, 17, 20, 0).getTime()), true);
    assert.equal(showsTodayWord(new Date(2026, 10, 18, 3, 59).getTime()), true);
    assert.equal(showsTodayWord(new Date(2026, 10, 18, 4, 0).getTime()), false);
  });
});
