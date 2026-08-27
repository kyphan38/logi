import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockHeight,
  coverageOfDay,
  dayWindow,
  elasticRows,
  layoutDay,
  ELASTIC_MAX_PX,
  ELASTIC_MIN_PX,
  type BlockRow,
  type Row,
} from '@/lib/timeline';
import { act, at } from './_helpers.ts';

const DATE = '2026-08-27'; // thứ Năm
const win = dayWindow(DATE);
const END_OF_DAY = at('2026-08-28', '04:00');

/** layoutDay → coverageOfDay → elasticRows, đúng như màn hình đang chạy. */
function rowsFor(activities: Parameters<typeof layoutDay>[0], now = END_OF_DAY): Row[] {
  const { segments } = layoutDay(activities, win, now);
  const { gaps } = coverageOfDay(segments, win, now);
  return elasticRows(segments, gaps);
}

const blocks = (rows: Row[]) => rows.filter((r): r is BlockRow => r.kind === 'blocks');
const gapRows = (rows: Row[]) => rows.filter((r) => r.kind === 'gap');

// --- Chiều cao block --------------------------------------------------------

test('blockHeight: block 5 phút → 44px (chạm được bằng ngón tay)', () => {
  assert.equal(blockHeight(5 * 60_000), ELASTIC_MIN_PX);
  assert.equal(blockHeight(0), ELASTIC_MIN_PX);
});

test('blockHeight: block 9h → 132px (chạm trần)', () => {
  assert.equal(blockHeight(9 * 3_600_000), ELASTIC_MAX_PX);
  assert.equal(blockHeight(24 * 3_600_000), ELASTIC_MAX_PX, 'không được vượt trần');
});

test('blockHeight: ở giữa vẫn thấy được cái nào dài hơn', () => {
  const h1 = blockHeight(60 * 60_000);
  const h2 = blockHeight(180 * 60_000);
  assert.ok(h1 > ELASTIC_MIN_PX && h1 < h2 && h2 < ELASTIC_MAX_PX, `${h1} → ${h2}`);
});

// --- Khoảng trống -----------------------------------------------------------

test('khoảng trống 45 phút → tạo dòng untracked', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'work', startAt: at(DATE, '10:45'), endAt: at(DATE, '12:00') }),
  ]);
  assert.ok(
    gapRows(rows).some((g) => g.start === at(DATE, '10:00') && g.end === at(DATE, '10:45')),
    'phải có dòng untracked giữa hai block'
  );
});

test('khoảng trống 20 phút → không tạo dòng', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'work', startAt: at(DATE, '10:20'), endAt: at(DATE, '12:00') }),
  ]);
  assert.equal(
    gapRows(rows).some((g) => g.start === at(DATE, '10:00')),
    false,
    'dưới 30 phút thì chỉ để 8px khoảng cách'
  );
});

// --- Block chồng nhau -------------------------------------------------------

test('2 record chồng giờ → CÙNG một hàng, 2 lane, cả hai bấm được', () => {
  const rows = rowsFor([
    act({ id: 'w', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '12:00') }),
    act({ id: 'l', category: 'learn', startAt: at(DATE, '10:00'), endAt: at(DATE, '11:00') }),
  ]);
  const bs = blocks(rows);
  assert.equal(bs.length, 1, 'chồng giờ thì gộp thành một hàng');
  assert.equal(bs[0].blocks.length, 2);
  assert.deepEqual(
    bs[0].blocks.map((b) => b.lane),
    [0, 1],
    'hai lane riêng → nằm cạnh nhau, không đè lên nhau'
  );
  // Chiều cao hàng = block cao nhất trong nhóm.
  assert.equal(bs[0].height, blockHeight(3 * 3_600_000));
});

test('không chồng giờ → mỗi record một hàng, mỗi hàng 1 lane', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'learn', startAt: at(DATE, '11:00'), endAt: at(DATE, '12:00') }),
  ]);
  const bs = blocks(rows);
  assert.equal(bs.length, 2);
  for (const r of bs) assert.deepEqual(r.blocks.map((b) => b.lane), [0]);
});

test('layoutDay: ngày không chồng giờ thì laneCount = 1 (không sinh sliver)', () => {
  const day = [
    act({ id: 's', category: 'sleep', startAt: at(DATE, '23:00'), endAt: at('2026-08-28', '06:00') }),
    act({ id: 'w1', category: 'work', startAt: at(DATE, '08:00'), endAt: at(DATE, '12:00') }),
    act({ id: 'w2', category: 'work', startAt: at(DATE, '13:00'), endAt: at(DATE, '17:30') }),
    act({ id: 'f', category: 'fitness', startAt: at(DATE, '18:00'), endAt: at(DATE, '19:00') }),
    act({ id: 'l', category: 'learn', startAt: at(DATE, '20:00'), endAt: at(DATE, '21:30') }),
  ];
  assert.equal(layoutDay(day, win, END_OF_DAY).laneCount, 1);
});

// --- Ngày hôm nay -----------------------------------------------------------

test('ngày hôm nay → không tạo dòng untracked cho phần tương lai', () => {
  const now = at(DATE, '12:00');
  const rows = rowsFor(
    [act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '11:00') })],
    now
  );
  const gs = gapRows(rows);
  assert.ok(gs.length > 0);
  for (const g of gs) {
    assert.ok(g.end <= now, `dòng untracked kết thúc lúc ${new Date(g.end)} — quá "bây giờ"`);
  }
  assert.equal(
    gs.some((g) => g.end === win.end),
    false,
    'không được kéo dòng untracked tới 04:00 hôm sau'
  );
});

// --- Thứ tự & tổng chiều cao ------------------------------------------------

test('các hàng xếp đúng thứ tự thời gian', () => {
  const rows = rowsFor([
    act({ id: 'a', category: 'work', startAt: at(DATE, '09:00'), endAt: at(DATE, '10:00') }),
    act({ id: 'b', category: 'learn', startAt: at(DATE, '14:00'), endAt: at(DATE, '15:00') }),
    act({ id: 'c', category: 'leisure', startAt: at(DATE, '20:00'), endAt: at(DATE, '21:00') }),
  ]);
  const starts = rows.map((r) => r.start);
  assert.deepEqual(starts, [...starts].sort((x, y) => x - y));
});

test('ngày thưa co lại nhỏ hơn nhiều so với khung 1440px cũ', () => {
  const rows = rowsFor(
    [
      act({ id: 's', category: 'sleep', startAt: at(DATE, '04:00'), endAt: at(DATE, '06:40') }),
      act({ id: 'w1', category: 'work', startAt: at(DATE, '08:00'), endAt: at(DATE, '12:00') }),
      act({ id: 'w2', category: 'work', startAt: at(DATE, '13:00'), endAt: at(DATE, '17:30') }),
      act({ id: 'f', category: 'fitness', startAt: at(DATE, '18:00'), endAt: at(DATE, '19:00') }),
      act({ id: 'l', category: 'learn', startAt: at(DATE, '20:00'), endAt: at(DATE, '21:30') }),
      act({ id: 'x', category: 'leisure', startAt: at(DATE, '22:00'), endAt: at(DATE, '23:00') }),
    ],
    at(DATE, '23:30')
  );
  const total = rows.reduce((sum, r) => sum + (r.kind === 'gap' ? 32 : r.height) + 8, 0);
  assert.ok(total < 800, `6 record vẫn cao ${total}px — phải vừa một màn hình`);
});

test('block kéo sang từ hôm trước giữ nguyên cờ continuedFromPrevious', () => {
  const rows = rowsFor([
    act({
      id: 's',
      category: 'sleep',
      startAt: at('2026-08-26', '22:00'),
      endAt: at(DATE, '06:00'),
    }),
  ]);
  const first = blocks(rows)[0].blocks[0];
  assert.equal(first.continuedFromPrevious, true);
  assert.equal(first.start, win.start, 'phải cắt gọn về 04:00');
});
