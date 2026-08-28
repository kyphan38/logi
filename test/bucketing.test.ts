import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bucketMode, bucketsOf, MAX_DAY_COLUMNS } from '@/lib/bucket';
import { buildRange, type Range } from '@/lib/range';
import { at } from './_helpers.ts';

const NOW = at('2026-09-20', '12:00'); // xa hẳn mọi khoảng dưới đây

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

test('14 ngày → một cột mỗi ngày', () => {
  const range = full('2026-08-17', '2026-08-30'); // đúng 14 ngày
  assert.equal(bucketMode(range), 'day');

  const b = bucketsOf(range, NOW);
  assert.equal(b.length, 14);
  assert.equal(b[0].label, 'Mon 17');
  assert.equal(b[0].range.from, '2026-08-17');
  assert.equal(b[0].range.to, '2026-08-17');
});

test('15 ngày → một cột mỗi tuần', () => {
  const range = full('2026-08-17', '2026-08-31'); // 15 ngày
  assert.equal(bucketMode(range), 'week');

  const b = bucketsOf(range, NOW);
  assert.equal(b.length, 3); // W34, W35, W36 (mỗi 1 ngày)
  assert.deepEqual(
    b.map((x) => x.days),
    [7, 7, 1]
  );
});

test('ngưỡng nằm đúng ở 14', () => {
  assert.equal(MAX_DAY_COLUMNS, 14);
});

test('tuần ở hai đầu bị cắt theo biên của khoảng', () => {
  // Bắt đầu giữa tuần W35 (thứ Tư) và kết thúc giữa W36 (thứ Ba).
  const range = full('2026-08-26', '2026-09-08');
  assert.equal(bucketMode(range), 'day'); // 14 ngày

  const wide = full('2026-08-26', '2026-09-15');
  const wb = bucketsOf(wide, NOW);
  assert.equal(wb[0].range.from, '2026-08-26'); // KHÔNG lùi về thứ Hai
  assert.equal(wb[0].days, 5); // T4..CN
  assert.equal(wb[wb.length - 1].range.to, '2026-09-15');
});

test('nhãn tuần là W-số, nhãn ngày có thứ', () => {
  const week = bucketsOf(full('2026-08-17', '2026-09-30'), NOW);
  assert.match(week[0].label, /^W\d{2}$/);

  const day = bucketsOf(full('2026-08-24', '2026-08-26'), NOW);
  assert.equal(day[1].label, 'Tue 25');
});

test('chỉ cột chứa hôm nay mới dở dang', () => {
  const now = at('2026-08-26', '16:00');
  const range = buildRange('this_week', now); // T2 24 → hôm nay 26
  const b = bucketsOf(range, now);

  assert.equal(b.length, 3);
  assert.equal(b[0].range.isPartial, false); // Mon
  assert.equal(b[1].range.isPartial, false); // Tue
  assert.equal(b[2].range.isPartial, true); // hôm nay
});

test('khoảng đã đóng thì không cột nào dở dang', () => {
  const now = at('2026-09-02', '10:00');
  const range = buildRange('last_week', now);
  const b = bucketsOf(range, now);
  assert.equal(b.length, 7);
  assert.ok(b.every((x) => x.range.isPartial === false));
});

test('khoảng một ngày → đúng một cột', () => {
  const b = bucketsOf(full('2026-08-24', '2026-08-24'), NOW);
  assert.equal(b.length, 1);
  assert.equal(b[0].days, 1);
});

test('92 ngày (giới hạn trên) vẫn ra số cột đọc được', () => {
  const b = bucketsOf(full('2026-06-01', '2026-08-31'), NOW);
  assert.equal(bucketMode(full('2026-06-01', '2026-08-31')), 'week');
  assert.ok(b.length <= 14, `số cột = ${b.length}`);
});
