import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heatmapFits, heatmapOf, MAX_HEATMAP_DAYS } from '@/lib/heatmap';
import type { Range } from '@/lib/range';
import { act, at } from './_helpers.ts';

const D = '2026-08-25';
const NOW = at('2026-08-30', '12:00');

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

/** Row 0 is 00:00 → the real clock hour is the row itself. */
const row = (h: number) => h;

test('Session 8:00–11:00 → exactly 3 full cells', () => {
  const acts = [act({ startAt: at(D, '08:00'), endAt: at(D, '11:00'), category: 'work' })];
  const { grid, hours } = heatmapOf(acts, full(D, D), NOW);

  assert.equal(hours[0], '00:00');
  assert.equal(hours[23], '23:00');

  for (const h of [8, 9, 10]) {
    assert.equal(grid[row(h)][0].category, 'work');
    assert.equal(grid[row(h)][0].minutes, 60);
  }
  assert.equal(grid[row(11)][0].category, null);
  assert.equal(grid[row(7)][0].category, null);
});

test('Session 9:15–9:45 → the 9h cell is only 50% full', () => {
  const acts = [act({ startAt: at(D, '09:15'), endAt: at(D, '09:45'), category: 'learn' })];
  const { grid } = heatmapOf(acts, full(D, D), NOW);

  assert.equal(grid[row(9)][0].category, 'learn');
  assert.equal(grid[row(9)][0].minutes, 30);
});

test('two categories in one hour → the cell takes the one with more minutes', () => {
  const acts = [
    act({ id: 'a', startAt: at(D, '09:00'), endAt: at(D, '09:15'), category: 'learn' }),
    act({ id: 'b', startAt: at(D, '09:15'), endAt: at(D, '10:00'), category: 'work' }),
  ];
  const { grid } = heatmapOf(acts, full(D, D), NOW);

  assert.equal(grid[row(9)][0].category, 'work'); // 45 min > 15 min
  assert.equal(grid[row(9)][0].minutes, 45);
});

test('night shift 22:00 → 06:00 crosses midnight, by real clock time', () => {
  const acts = [
    act({ startAt: at('2026-08-24', '22:00'), endAt: at(D, '06:00'), category: 'work' }),
  ];
  const { grid, days } = heatmapOf(acts, full('2026-08-24', D), NOW);

  assert.deepEqual(days, ['2026-08-24', '2026-08-25']);

  // 22:00 and 23:00 are still calendar day 24.
  for (const h of [22, 23]) {
    assert.equal(grid[row(h)][0].category, 'work', `hour ${h} must be work in column 0`);
  }
  // After midnight it moves to column 25, even if the record is logical day 24.
  for (const h of [0, 1, 2, 3, 4, 5]) {
    assert.equal(grid[row(h)][1].category, 'work', `hour ${h} must be work in column 1`);
    assert.equal(grid[row(h)][0].category, null);
  }
});

test('session 00:15 → 07:30 fills cells 00:00–07:00 of THAT calendar day column', () => {
  // The record is logical day 2026-08-24 (starts after 00:00, before 04:00).
  const acts = [
    act({ startAt: at(D, '00:15'), endAt: at(D, '07:30'), category: 'work' }),
  ];
  const { grid } = heatmapOf(acts, full('2026-08-24', D), NOW);

  for (const h of [0, 1, 2, 3, 4, 5, 6, 7]) {
    assert.equal(grid[row(h)][1].category, 'work', `hour ${h} must be work in column 25`);
  }
  assert.equal(grid[row(0)][1].minutes, 45);
  assert.equal(grid[row(7)][1].minutes, 30);
  assert.equal(grid[row(8)][1].category, null);
});

test('the part outside the range is clipped', () => {
  const acts = [
    act({ startAt: at('2026-08-24', '22:00'), endAt: at(D, '06:00'), category: 'work' }),
  ];
  const { grid } = heatmapOf(acts, full('2026-08-24', '2026-08-24'), NOW);
  // Only 1 column; 00:00–06:00 of the next calendar day has nowhere to go.
  assert.equal(grid.length, 24);
  assert.equal(grid[row(23)][0].category, 'work');
  assert.equal(grid[row(0)][0].category, null);
});

test('a running session fills only up to now', () => {
  const now = at(D, '09:30');
  const acts = [act({ startAt: at(D, '08:00'), endAt: null, category: 'work' })];
  const { grid } = heatmapOf(acts, { from: D, to: D, kind: 'custom', isPartial: true }, now);

  assert.equal(grid[row(8)][0].minutes, 60);
  assert.equal(grid[row(9)][0].minutes, 30);
  assert.equal(grid[row(10)][0].category, null);
});

test('abandoned / scheduled fill no cells', () => {
  const acts = [
    act({ startAt: at(D, '08:00'), endAt: at(D, '11:00'), status: 'abandoned' }),
    act({ id: 's', startAt: at(D, '12:00'), endAt: at(D, '13:00'), status: 'scheduled' }),
  ];
  const { grid } = heatmapOf(acts, full(D, D), NOW);
  assert.ok(grid.every((r) => r.every((c) => c.category === null)));
});

test('the grid is always 24 rows × days, even when empty', () => {
  const { grid, days } = heatmapOf([], full('2026-08-24', '2026-08-30'), NOW);
  assert.equal(grid.length, 24);
  assert.equal(days.length, 7);
  assert.ok(grid.every((r) => r.length === 7));
});

test('over 14 days the heatmap is not drawn', () => {
  assert.equal(MAX_HEATMAP_DAYS, 14);
  assert.ok(heatmapFits(full('2026-08-17', '2026-08-30'))); // 14
  assert.ok(!heatmapFits(full('2026-08-17', '2026-08-31'))); // 15
});
