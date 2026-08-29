import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nowTiles } from '@/lib/day-progress';
import { logicalWeekday } from '@/lib/balance';
import { BASELINE_WEEKLY, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

// 2026-08-25 là thứ Ba, 2026-08-30 là Chủ nhật.
const TUE = '2026-08-25';
const SUN = '2026-08-30';

const NORMAL = { ...BASELINE_WEEKLY } as Record<Category, number>;
const tileOf = (tiles: ReturnType<typeof nowTiles>, c: Category) =>
  tiles.find((t) => t.category === c)!;

function tilesOn(date: string, activities: Parameters<typeof nowTiles>[0], hhmm = '20:00') {
  const now = at(date, hhmm);
  return nowTiles(activities, NORMAL, logicalWeekday(now), now);
}

test('target lấy đúng thứ trong tuần: thứ Ba Work = 9.5h', () => {
  const t = tilesOn(TUE, []);
  assert.equal(tileOf(t, 'work').target, 9.5);
  assert.equal(tileOf(t, 'learn').target, 3);
  assert.equal(tileOf(t, 'fitness').target, 1.5);
});

test('fill = actual / target', () => {
  const acts = [
    act({ startAt: at(TUE, '09:00'), endAt: at(TUE, '13:00'), category: 'work' }), // 4h
  ];
  const w = tileOf(tilesOn(TUE, acts), 'work');
  assert.equal(w.actual, 4);
  assert.equal(Math.round(w.fill * 1000) / 1000, Math.round((4 / 9.5) * 1000) / 1000);
  assert.equal(w.over, false);
  assert.equal(w.label, '4.0 / 9.5h');
});

test('vượt target → fill kẹp ở 1, cờ over bật', () => {
  const acts = [
    act({ startAt: at(TUE, '06:00'), endAt: at(TUE, '18:00'), category: 'work' }), // 12h
  ];
  const w = tileOf(tilesOn(TUE, acts), 'work');
  assert.equal(w.fill, 1, 'không bao giờ quá 1');
  assert.equal(w.over, true);
});

test('Chủ nhật: Work không có target → không vẽ dải, nhãn 0.0 / —', () => {
  const w = tileOf(tilesOn(SUN, []), 'work');
  assert.equal(w.target, 0);
  assert.equal(w.noTarget, true);
  assert.equal(w.fill, 0);
  assert.equal(w.label, '0.0 / —');
});

test('có log mà ngày đó không target → vẫn không vẽ dải, số vẫn đúng', () => {
  const acts = [
    act({ startAt: at(SUN, '10:00'), endAt: at(SUN, '12:30'), category: 'work' }),
  ];
  const w = tileOf(tilesOn(SUN, acts), 'work');
  assert.equal(w.actual, 2.5);
  assert.equal(w.noTarget, true);
  assert.equal(w.label, '2.5 / —');
});

test('chưa có weekTarget → mọi nút đều noTarget, không đoán bừa', () => {
  const now = at(TUE, '20:00');
  const tiles = nowTiles([], null, logicalWeekday(now), now);
  assert.equal(tiles.length, 4);
  assert.ok(tiles.every((t) => t.noTarget));
});

test('đúng 4 category, không còn sleep', () => {
  const tiles = tilesOn(TUE, []);
  assert.deepEqual(
    tiles.map((t) => t.category),
    ['learn', 'work', 'fitness', 'leisure']
  );
});

test('session đang chạy được tính tới now', () => {
  const now = at(TUE, '11:00');
  const acts = [act({ startAt: at(TUE, '09:00'), endAt: null, category: 'learn' })];
  const t = nowTiles(acts, NORMAL, logicalWeekday(now), now);
  assert.equal(tileOf(t, 'learn').actual, 2);
});
