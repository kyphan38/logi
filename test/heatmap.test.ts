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

/** Hàng 0 là 00:00 → giờ đồng hồ thật là chính nó (AMENDMENT sleep-boundary). */
const row = (h: number) => h;

test('Session 8:00–11:00 → tô đúng 3 ô đầy', () => {
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

test('Session 9:15–9:45 → ô 9h chỉ đầy 50%', () => {
  const acts = [act({ startAt: at(D, '09:15'), endAt: at(D, '09:45'), category: 'learn' })];
  const { grid } = heatmapOf(acts, full(D, D), NOW);

  assert.equal(grid[row(9)][0].category, 'learn');
  assert.equal(grid[row(9)][0].minutes, 30);
});

test('hai category trong cùng một giờ → ô lấy category nhiều phút hơn', () => {
  const acts = [
    act({ id: 'a', startAt: at(D, '09:00'), endAt: at(D, '09:15'), category: 'learn' }),
    act({ id: 'b', startAt: at(D, '09:15'), endAt: at(D, '10:00'), category: 'work' }),
  ];
  const { grid } = heatmapOf(acts, full(D, D), NOW);

  assert.equal(grid[row(9)][0].category, 'work'); // 45 phút > 15 phút
  assert.equal(grid[row(9)][0].minutes, 45);
});

test('Sleep 22:00 → 06:00 vẽ xuyên nửa đêm, theo giờ đồng hồ thật', () => {
  const acts = [
    act({ startAt: at('2026-08-24', '22:00'), endAt: at(D, '06:00'), category: 'sleep' }),
  ];
  const { grid, days } = heatmapOf(acts, full('2026-08-24', D), NOW);

  assert.deepEqual(days, ['2026-08-24', '2026-08-25']);

  // 22:00 và 23:00 vẫn là ngày lịch 24.
  for (const h of [22, 23]) {
    assert.equal(grid[row(h)][0].category, 'sleep', `giờ ${h} phải là sleep ở cột 0`);
  }
  // Qua nửa đêm là sang cột 25, kể cả khi record thuộc ngày logic 24.
  for (const h of [0, 1, 2, 3, 4, 5]) {
    assert.equal(grid[row(h)][1].category, 'sleep', `giờ ${h} phải là sleep ở cột 1`);
    assert.equal(grid[row(h)][0].category, null);
  }
});

test('Sleep 00:15 → 07:30 tô các ô 00:00–07:00 của ĐÚNG cột ngày lịch đó', () => {
  // Record thuộc ngày logic 2026-08-24 (bắt đầu sau 00:00, trước 04:00).
  const acts = [
    act({ startAt: at(D, '00:15'), endAt: at(D, '07:30'), category: 'sleep' }),
  ];
  const { grid } = heatmapOf(acts, full('2026-08-24', D), NOW);

  for (const h of [0, 1, 2, 3, 4, 5, 6, 7]) {
    assert.equal(grid[row(h)][1].category, 'sleep', `giờ ${h} phải là sleep ở cột 25`);
  }
  assert.equal(grid[row(0)][1].minutes, 45);
  assert.equal(grid[row(7)][1].minutes, 30);
  assert.equal(grid[row(8)][1].category, null);
});

test('phần vượt ra ngoài khoảng bị cắt', () => {
  const acts = [
    act({ startAt: at('2026-08-24', '22:00'), endAt: at(D, '06:00'), category: 'sleep' }),
  ];
  const { grid } = heatmapOf(acts, full('2026-08-24', '2026-08-24'), NOW);
  // Chỉ còn 1 cột; 00:00–06:00 của ngày lịch sau không có chỗ để rơi vào.
  assert.equal(grid.length, 24);
  assert.equal(grid[row(23)][0].category, 'sleep');
  assert.equal(grid[row(0)][0].category, null);
});

test('session đang chạy chỉ tô tới now', () => {
  const now = at(D, '09:30');
  const acts = [act({ startAt: at(D, '08:00'), endAt: null, category: 'work' })];
  const { grid } = heatmapOf(acts, { from: D, to: D, kind: 'today', isPartial: true }, now);

  assert.equal(grid[row(8)][0].minutes, 60);
  assert.equal(grid[row(9)][0].minutes, 30);
  assert.equal(grid[row(10)][0].category, null);
});

test('abandoned / scheduled không tô ô nào', () => {
  const acts = [
    act({ startAt: at(D, '08:00'), endAt: at(D, '11:00'), status: 'abandoned' }),
    act({ id: 's', startAt: at(D, '12:00'), endAt: at(D, '13:00'), status: 'scheduled' }),
  ];
  const { grid } = heatmapOf(acts, full(D, D), NOW);
  assert.ok(grid.every((r) => r.every((c) => c.category === null)));
});

test('lưới luôn là 24 hàng × số ngày, kể cả khi rỗng', () => {
  const { grid, days } = heatmapOf([], full('2026-08-24', '2026-08-30'), NOW);
  assert.equal(grid.length, 24);
  assert.equal(days.length, 7);
  assert.ok(grid.every((r) => r.length === 7));
});

test('quá 14 ngày thì heatmap không vẽ', () => {
  assert.equal(MAX_HEATMAP_DAYS, 14);
  assert.ok(heatmapFits(full('2026-08-17', '2026-08-30'))); // 14
  assert.ok(!heatmapFits(full('2026-08-17', '2026-08-31'))); // 15
});
