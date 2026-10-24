import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRoutineRequest, routineSnapshot, weekdayOf } from '@/lib/mora-routine';
import type { RoutineGroup } from '@/types/logi';

const group = (id: string, title: string, items: RoutineGroup['items']): RoutineGroup => ({
  id, title, order: 0, items, archivedAt: null, createdAt: 0, updatedAt: 0,
});

test('weekdayOf reads the logical day, not the clock', () => {
  assert.equal(weekdayOf('2026-10-24'), 6);
  assert.equal(weekdayOf('2026-10-26'), 1);
});

test('snapshot: only today items, flat in group order, with ticks', () => {
  const groups = [
    group('g1', 'Morning', [
      { id: 'a', text: 'Read', days: [6], minutes: 50, category: 'learn' },
      { id: 'b', text: 'Run', days: [1], category: 'fitness' },
    ]),
    group('g2', 'Evening', [{ id: 'c', text: 'Plan', days: [0, 6] }]),
  ];
  const s = routineSnapshot(groups, { date: '2026-10-24', checked: { c: 1 } }, '2026-10-24');
  assert.equal(s.date, '2026-10-24');
  assert.deepEqual(s.items, [
    { id: 'a', text: 'Read', group: 'Morning', minutes: 50, category: 'learn', done: false },
    { id: 'c', text: 'Plan', group: 'Evening', minutes: null, category: null, done: true },
  ]);
});

test('routine requests: get by default, tick needs date, id and on', () => {
  assert.deepEqual(readRoutineRequest({}), { action: 'get' });
  assert.deepEqual(readRoutineRequest({ action: 'tick', date: '2026-10-24', itemId: 'abc', on: true }), {
    action: 'tick', date: '2026-10-24', itemId: 'abc', on: true,
  });
  assert.throws(() => readRoutineRequest({ action: 'tick', date: 'today', itemId: 'abc', on: true }));
  assert.throws(() => readRoutineRequest({ action: 'tick', date: '2026-10-24', itemId: 'a b', on: true }));
  assert.throws(() => readRoutineRequest({ action: 'tick', date: '2026-10-24', itemId: 'abc' }));
  assert.throws(() => readRoutineRequest({ action: 'delete' }));
});
