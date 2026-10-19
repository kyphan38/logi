import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nowTiles } from '@/lib/day-progress';
import { logicalWeekday } from '@/lib/balance';
import { BASELINE_WEEKLY, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

// 2026-08-25 is a Tuesday, 2026-08-30 is a Sunday.
const TUE = '2026-08-25';
const SUN = '2026-08-30';

const NORMAL = { ...BASELINE_WEEKLY } as Record<Category, number>;
const tileOf = (tiles: ReturnType<typeof nowTiles>, c: Category) =>
  tiles.find((t) => t.category === c)!;

function tilesOn(date: string, activities: Parameters<typeof nowTiles>[0], hhmm = '20:00') {
  const now = at(date, hhmm);
  return nowTiles(activities, NORMAL, logicalWeekday(now), now);
}

test('target uses the right weekday: Tuesday Work = 9.5h', () => {
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
  assert.equal(w.label, '4.0 / 9.5h today');
});

test('over target → fill clamps at 1, over flag set', () => {
  const acts = [
    act({ startAt: at(TUE, '06:00'), endAt: at(TUE, '18:00'), category: 'work' }), // 12h
  ];
  const w = tileOf(tilesOn(TUE, acts), 'work');
  assert.equal(w.fill, 1, 'never above 1');
  assert.equal(w.over, true);
});

test('Sunday: Work has no target → no bar, label 0.0 / -', () => {
  const w = tileOf(tilesOn(SUN, []), 'work');
  assert.equal(w.target, 0);
  assert.equal(w.noTarget, true);
  assert.equal(w.fill, 0);
  assert.equal(w.label, '0.0 / - today');
});

test('logs on a day with no target → still no bar, numbers still right', () => {
  const acts = [
    act({ startAt: at(SUN, '10:00'), endAt: at(SUN, '12:30'), category: 'work' }),
  ];
  const w = tileOf(tilesOn(SUN, acts), 'work');
  assert.equal(w.actual, 2.5);
  assert.equal(w.noTarget, true);
  assert.equal(w.label, '2.5 / - today');
});

test('no weekTarget yet → every node is noTarget, no guessing', () => {
  const now = at(TUE, '20:00');
  const tiles = nowTiles([], null, logicalWeekday(now), now);
  assert.equal(tiles.length, 4);
  assert.ok(tiles.every((t) => t.noTarget));
});

test('exactly 4 categories, no sleep', () => {
  const tiles = tilesOn(TUE, []);
  assert.deepEqual(
    tiles.map((t) => t.category),
    ['learn', 'work', 'fitness', 'leisure']
  );
});

test('a running session counts up to now', () => {
  const now = at(TUE, '11:00');
  const acts = [act({ startAt: at(TUE, '09:00'), endAt: null, category: 'learn' })];
  const t = nowTiles(acts, NORMAL, logicalWeekday(now), now);
  assert.equal(tileOf(t, 'learn').actual, 2);
});
