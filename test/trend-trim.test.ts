import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_BARS,
  MIN_TREND_BUCKETS,
  chartKind,
  labelInterval,
  onTrackPct,
  trendCompare,
  trimLeadingEmpty,
  type TrendPoint,
} from '@/lib/trend';

// ---------------------------------------------------------------------------
// trimLeadingEmpty - "26 tuần" là TỐI ĐA 26 tuần
// ---------------------------------------------------------------------------

const has = (b: { d: boolean }) => b.d;
const mk = (...flags: boolean[]) => flags.map((d, i) => ({ i, d }));

test('cắt các kỳ trống ở đầu', () => {
  const out = trimLeadingEmpty(mk(false, false, false, true, true, true), has);
  assert.deepEqual(out.map((b) => b.i), [3, 4, 5]);
});

test('GIỮ kỳ trống ở giữa - đó là tuần thật sự nghỉ', () => {
  const out = trimLeadingEmpty(mk(false, true, false, false, true, true), has);
  assert.deepEqual(out.map((b) => b.i), [1, 2, 3, 4, 5]);
});

test('không có kỳ nào trống ở đầu thì giữ nguyên', () => {
  const out = trimLeadingEmpty(mk(true, true, true, true), has);
  assert.equal(out.length, 4);
});

test('không kỳ nào có dữ liệu → mảng rỗng', () => {
  assert.deepEqual(trimLeadingEmpty(mk(false, false, false), has), []);
  assert.deepEqual(trimLeadingEmpty([], has), []);
});

test('nhả bớt cho đủ sàn khi cắt quá tay', () => {
  // chỉ kỳ cuối có dữ liệu → cắt hết sẽ còn 1 cột, trông như lỗi render
  const out = trimLeadingEmpty(mk(false, false, false, false, false, true), has);
  assert.equal(out.length, MIN_TREND_BUCKETS);
  assert.deepEqual(out.map((b) => b.i), [3, 4, 5]);
});

test('mảng ngắn hơn sàn thì giữ hết, không bịa thêm cột', () => {
  const out = trimLeadingEmpty(mk(false, true), has);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((b) => b.i), [0, 1]);
});

// ---------------------------------------------------------------------------
// chartKind / labelInterval - đổi cách vẽ theo SỐ CỘT
// ---------------------------------------------------------------------------

test('bar tới 13 cột, quá 13 thì line', () => {
  assert.equal(chartKind(1), 'bars');
  assert.equal(chartKind(MAX_BARS), 'bars');
  assert.equal(chartKind(MAX_BARS + 1), 'line');
  assert.equal(chartKind(26), 'line');
});

test('nhãn trục X thưa ra đúng lúc đổi sang line', () => {
  assert.equal(labelInterval(MAX_BARS), 0);
  assert.equal(labelInterval(MAX_BARS + 1), 3);
});

// ---------------------------------------------------------------------------
// onTrackPct - thiếu dữ liệu không phải dữ liệu bằng không
// ---------------------------------------------------------------------------

test('onTrackPct: 100% là đúng target', () => {
  assert.equal(onTrackPct(6, 6), 100);
  assert.equal(onTrackPct(3, 6), 50);
  assert.equal(onTrackPct(9, 6), 150);
  assert.equal(onTrackPct(0, 6), 0);
});

test('onTrackPct: không dữ liệu hoặc không target → null, KHÔNG phải 0', () => {
  assert.equal(onTrackPct(null, 6), null);
  assert.equal(onTrackPct(5, 0), null);
  assert.equal(onTrackPct(5, -1), null);
  assert.equal(onTrackPct(null, 0), null);
});

// ---------------------------------------------------------------------------
// trendCompare: ngưỡng "đứng yên" đổi được theo đơn vị
// ---------------------------------------------------------------------------

const pt = (label: string, hours: number | null, partial = false): TrendPoint => ({
  label,
  hours,
  partial,
});

test('ngưỡng mặc định 0.5h giữ nguyên hành vi cũ', () => {
  assert.equal(trendCompare([pt('W34', 7.0), pt('W35', 7.3)])?.word, 'flat');
  assert.equal(trendCompare([pt('W34', 7.0), pt('W35', 9.0)])?.word, 'up');
});

test('đơn vị phần trăm dùng ngưỡng 5 điểm', () => {
  assert.equal(trendCompare([pt('W34', 100), pt('W35', 103)], 5)?.word, 'flat');
  assert.equal(trendCompare([pt('W34', 100), pt('W35', 120)], 5)?.word, 'up');
  assert.equal(trendCompare([pt('W34', 100), pt('W35', 80)], 5)?.word, 'down');
});

test('dưới 2 kỳ dùng được thì không so - thà im còn hơn bịa', () => {
  assert.equal(trendCompare([pt('W35', 7, true)], 5), null);
  assert.equal(trendCompare([pt('W34', null), pt('W35', 7)], 5), null);
});
