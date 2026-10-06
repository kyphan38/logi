import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockHeight,
  dayGaps,
  dayWindow,
  elasticRows,
  layoutDay,
  ELASTIC_MAX_PX,
  ELASTIC_MIN_PX,
  type BlockRow,
  type Row,
} from '@/lib/timeline';
import { act, at } from './_helpers.ts';

const DATE = '2026-08-27'; // Thursday
const win = dayWindow(DATE);
const END_OF_DAY = at('2026-08-28', '04:00');

/** layoutDay → dayGaps → elasticRows, same as the live screen. */
function rowsFor(activities: Parameters<typeof layoutDay>[0], now = END_OF_DAY): Row[] {
  const { segments } = layoutDay(activities, win, now);
  const { gaps } = dayGaps(segments, win, now);
  return elasticRows(segments, gaps);
}

const blocks = (rows: Row[]) => rows.filter((r): r is BlockRow => r.kind === 'blocks');
const gapRows = (rows: Row[]) => rows.filter((r) => r.kind === 'gap');

// --- Block height --------------------------------------------------------

test('blockHeight: 5-minute block → 44px (finger tappable)', () => {
  assert.equal(blockHeight(5 * 60_000), ELASTIC_MIN_PX);
  assert.equal(blockHeight(0), ELASTIC_MIN_PX);
});

test('blockHeight: 9h block → 132px (hits the cap)', () => {
  assert.equal(blockHeight(9 * 3_600_000), ELASTIC_MAX_PX);
  assert.equal(blockHeight(24 * 3_600_000), ELASTIC_MAX_PX, 'must not exceed the cap');
});

test('blockHeight: in between, the longer one still looks longer', () => {
  const h1 = blockHeight(60 * 60_000);
  const h2 = blockHeight(180 * 60_000);
  assert.ok(h1 > ELASTIC_MIN_PX && h1 < h2 && h2 < ELASTIC_MAX_PX, `${h1} → ${h2}`);
});

// --- Gaps -----------------------------------------------------------

test('45-minute gap → untracked row', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'work', startAt: at(DATE, '10:45'), endAt: at(DATE, '12:00') }),
  ]);
  assert.ok(
    gapRows(rows).some((g) => g.start === at(DATE, '10:00') && g.end === at(DATE, '10:45')),
    'there must be an untracked row between the two blocks'
  );
});

test('20-minute gap → no row', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'work', startAt: at(DATE, '10:20'), endAt: at(DATE, '12:00') }),
  ]);
  assert.equal(
    gapRows(rows).some((g) => g.start === at(DATE, '10:00')),
    false,
    'under 30 minutes only leaves an 8px space'
  );
});

// --- Overlapping blocks -------------------------------------------------------

test('2 overlapping records → SAME row, 2 lanes, both tappable', () => {
  const rows = rowsFor([
    act({ id: 'w', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '12:00') }),
    act({ id: 'l', category: 'learn', startAt: at(DATE, '10:00'), endAt: at(DATE, '11:00') }),
  ]);
  const bs = blocks(rows);
  assert.equal(bs.length, 1, 'overlaps merge into one row');
  assert.equal(bs[0].blocks.length, 2);
  assert.deepEqual(
    bs[0].blocks.map((b) => b.lane),
    [0, 1],
    'two separate lanes → side by side, not on top of each other'
  );
  // Row height = the tallest block in the group.
  assert.equal(bs[0].height, blockHeight(3 * 3_600_000));
});

test('no overlap → one row per record, one lane per row', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'learn', startAt: at(DATE, '11:00'), endAt: at(DATE, '12:00') }),
  ]);
  const bs = blocks(rows);
  assert.equal(bs.length, 2);
  for (const r of bs) assert.deepEqual(r.blocks.map((b) => b.lane), [0]);
});

test('layoutDay: a day with no overlap has laneCount = 1 (no slivers)', () => {
  const day = [
    act({ id: 's', category: 'work', startAt: at(DATE, '23:00'), endAt: at('2026-08-28', '06:00') }),
    act({ id: 'w1', category: 'work', startAt: at(DATE, '08:00'), endAt: at(DATE, '12:00') }),
    act({ id: 'w2', category: 'work', startAt: at(DATE, '13:00'), endAt: at(DATE, '17:30') }),
    act({ id: 'f', category: 'fitness', startAt: at(DATE, '18:00'), endAt: at(DATE, '19:00') }),
    act({ id: 'l', category: 'learn', startAt: at(DATE, '20:00'), endAt: at(DATE, '21:30') }),
  ];
  assert.equal(layoutDay(day, win, END_OF_DAY).laneCount, 1);
});

// --- Today -----------------------------------------------------------

test('today → no untracked row for the future part', () => {
  const now = at(DATE, '12:00');
  const rows = rowsFor(
    [act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '11:00') })],
    now
  );
  const gs = gapRows(rows);
  assert.ok(gs.length > 0);
  for (const g of gs) {
    assert.ok(g.end <= now, `untracked row ends at ${new Date(g.end)} - past "now"`);
  }
  assert.equal(
    gs.some((g) => g.end === win.end),
    false,
    'the untracked row must not stretch to 04:00 next day'
  );
});

// --- Order & total height ------------------------------------------------

test('rows are in time order', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'learn', startAt: at(DATE, '14:00'), endAt: at(DATE, '15:00') }),
    act({ id: 'c', category: 'leisure', startAt: at(DATE, '20:00'), endAt: at(DATE, '21:00') }),
  ]);
  const starts = rows.map((r) => r.start);
  assert.deepEqual(starts, [...starts].sort((x, y) => x - y));
});

test('a sparse day is much shorter than the old 1440px frame', () => {
  const rows = rowsFor(
    [
      act({ id: 's', category: 'leisure', startAt: at(DATE, '04:00'), endAt: at(DATE, '06:40') }),
      act({ id: 'w1', category: 'work', startAt: at(DATE, '08:00'), endAt: at(DATE, '12:00') }),
      act({ id: 'w2', category: 'work', startAt: at(DATE, '13:00'), endAt: at(DATE, '17:30') }),
      act({ id: 'f', category: 'fitness', startAt: at(DATE, '18:00'), endAt: at(DATE, '19:00') }),
      act({ id: 'l', category: 'learn', startAt: at(DATE, '20:00'), endAt: at(DATE, '21:30') }),
      act({ id: 'x', category: 'leisure', startAt: at(DATE, '22:00'), endAt: at(DATE, '23:00') }),
    ],
    at(DATE, '23:30')
  );
  const total = rows.reduce((sum, r) => sum + (r.kind === 'gap' ? 32 : r.height) + 8, 0);
  assert.ok(total < 800, `6 records are still ${total}px tall - must fit one screen`);
});

test('a block from the previous day still draws, cut at 04:00', () => {
  const rows = rowsFor([
    act({
      id: 's',
      category: 'work',
      startAt: at('2026-08-26', '22:00'),
      endAt: at(DATE, '06:00'),
    }),
  ]);
  const first = blocks(rows)[0].blocks[0];
  assert.equal(first.start, win.start, 'must be cut to 04:00');
  assert.equal(first.crossesMidnight, true);
});
