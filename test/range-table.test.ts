import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logicalWeek } from '@/lib/balance';
import { buildRange, type Range } from '@/lib/range';
import { fullPeriod, isOpenPeriod, rangeTable } from '@/lib/range-table';
import { BASELINE_WEEKLY, type Category } from '@/types/logi';

import { act, at } from './_helpers.ts';

// 2026-08-26 là thứ Tư. Tuần logic chạy thứ Hai 2026-08-24 → Chủ nhật 2026-08-30.
const NOW = at('2026-08-26', '20:00');

function targets(now: number): Map<string, Record<Category, number>> {
  return new Map([[logicalWeek(now), { ...BASELINE_WEEKLY }]]);
}

function custom(from: string, to: string, isPartial = false): Range {
  return { from, to, kind: 'custom', isPartial };
}

test('this_week: target là cả bảy ngày, không dừng ở hôm nay', () => {
  const r = buildRange('this_week', NOW);
  assert.equal(r.to, '2026-08-26'); // range dừng ở hôm nay
  const full = fullPeriod(r);
  assert.equal(full.from, '2026-08-24');
  assert.equal(full.to, '2026-08-30');

  const t = rangeTable([], r, targets(NOW), NOW);
  const work = t.rows.find((x) => x.category === 'work')!;
  assert.equal(Math.round(work.target * 10) / 10, BASELINE_WEEKLY.work);
});

test('range đang diễn ra → cột LEFT, không bao giờ âm', () => {
  const r = buildRange('this_week', NOW);
  // Work 60h trong khi target tuần là 43h → vượt xa, LEFT phải kẹp về 0.
  const acts = [act({ category: 'work', startAt: at('2026-08-24', '06:00'), endAt: at('2026-08-26', '18:00') })];

  const t = rangeTable(acts, r, targets(NOW), NOW);
  assert.equal(t.tail, 'left');
  assert.equal(t.tailLabel, 'Left');
  assert.equal(t.title, 'This week');
  assert.equal(t.note, 'Hours left this week.');
  for (const row of t.rows) assert.ok(row.tail >= 0, `${row.category} âm: ${row.tail}`);
  assert.equal(t.rows.find((x) => x.category === 'work')!.tail, 0);
});

test('range đã đóng → cột DIFF, có dấu', () => {
  const r = buildRange('last_week', NOW);
  assert.equal(isOpenPeriod(r, NOW), false);

  const acts = [act({ category: 'learn', startAt: at('2026-08-18', '08:00'), endAt: at('2026-08-18', '09:00') })];
  const t = rangeTable(acts, r, targets(NOW), NOW);

  assert.equal(t.tail, 'diff');
  assert.equal(t.tailLabel, 'Diff');
  assert.equal(t.title, 'Last week');
  assert.equal(t.note, 'Final numbers for the week.');

  const learn = t.rows.find((x) => x.category === 'learn')!;
  // Không có target tuần trước trong map → rơi về preset normal, chắc chắn > 1h.
  assert.ok(learn.tail < 0, 'thiếu target thì DIFF phải âm');
  assert.equal(Math.round((learn.done - learn.target) * 1000), Math.round(learn.tail * 1000));
});

test('this_month đang diễn ra → LEFT, chú thích riêng', () => {
  const r = buildRange('this_month', NOW);
  const full = fullPeriod(r);
  assert.equal(full.from, '2026-08-01');
  assert.equal(full.to, '2026-08-31');

  const t = rangeTable([], r, targets(NOW), NOW);
  assert.equal(t.tail, 'left');
  assert.equal(t.title, 'This month');
  assert.equal(t.note, 'Hours left this month.');
});

test('custom đã qua → DIFF; custom còn đang diễn ra → LEFT', () => {
  const past = custom('2026-08-10', '2026-08-20');
  const open = custom('2026-08-25', '2026-08-31');

  const a = rangeTable([], past, targets(NOW), NOW);
  assert.equal(a.tail, 'diff');
  assert.equal(a.note, 'Final numbers for this period.');
  assert.ok(a.title.includes('–'), `tiêu đề custom phải là khoảng ngày: ${a.title}`);

  const b = rangeTable([], open, targets(NOW), NOW);
  assert.equal(b.tail, 'left');
  assert.equal(b.note, 'Hours left in this period.');
});

test('chỉ ẩn dòng khi cả done và target đều 0', () => {
  // Chủ nhật 2026-08-30: Work target 0h, Fitness target 0h theo BASELINE_DAILY.
  const sun = custom('2026-08-30', '2026-08-30');
  const empty = rangeTable([], sun, targets(NOW), NOW);
  assert.ok(
    !empty.rows.some((r) => r.category === 'work'),
    'Work Chủ nhật không có gì thì phải ẩn'
  );

  // Có log Work Chủ nhật → phải hiện lại dù target vẫn 0.
  const acts = [act({ category: 'work', startAt: at('2026-08-30', '09:00'), endAt: at('2026-08-30', '11:00') })];
  const shown = rangeTable(acts, sun, targets(NOW), NOW);
  const work = shown.rows.find((r) => r.category === 'work');
  assert.ok(work, 'có log thì phải hiện');
  assert.equal(work.done, 2);
  assert.equal(work.target, 0);

  // Learn Chủ nhật có target 8h, chưa log gì → vẫn phải hiện để so sánh.
  assert.ok(empty.rows.some((r) => r.category === 'learn'));
});
