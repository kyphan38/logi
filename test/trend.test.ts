import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SPAN,
  TREND_SPANS,
  elapsedFraction,
  hasLogged,
  spanWeeks,
  trendBuckets,
  trendCompare,
  trendWindow,
  type TrendPoint,
} from '@/lib/trend';
import { weekDiff } from '@/lib/week';
import { at } from './_helpers.ts';

// Thứ Hai 2026-08-31, 12:00. Tuần logic: 2026-W36.
const NOW = at('2026-08-31', '12:00');

// ---------------------------------------------------------------------------
// spanWeeks
// ---------------------------------------------------------------------------

test('TREND_SPANS chỉ còn tuần, mặc định 6w', () => {
  assert.deepEqual(
    TREND_SPANS.map((s) => s.value),
    ['6w', '12w', '26w']
  );
  assert.ok(TREND_SPANS.some((s) => s.value === DEFAULT_SPAN));
  assert.equal(DEFAULT_SPAN, '6w');
});

test('spanWeeks đọc số tuần', () => {
  assert.equal(spanWeeks('6w'), 6);
  assert.equal(spanWeeks('12w'), 12);
  assert.equal(spanWeeks('26w'), 26);
});

test('trendBuckets ra đúng số cột, cũ → mới, cột cuối là kỳ đang chạy', () => {
  for (const s of TREND_SPANS) {
    const b = trendBuckets(s.value, NOW);
    assert.equal(b.length, spanWeeks(s.value));
    assert.equal(b[b.length - 1].partial, true);
    assert.equal(b.slice(0, -1).every((x) => x.partial === false), true);
    // khoá tuần, không còn khoá tháng
    assert.ok(b.every((x) => /^\d{4}-W\d{2}$/.test(x.key)));
    // cũ → mới
    for (let i = 1; i < b.length; i++) assert.ok(b[i].range.from > b[i - 1].range.from);
  }
});

test('26w: cột đầu cách cột cuối đúng 25 tuần', () => {
  const b = trendBuckets('26w', NOW);
  assert.equal(b.length, 26);
  assert.equal(weekDiff(b[0].key, b[25].key), 25);
});

// ---------------------------------------------------------------------------
// trendBuckets - tuần
// ---------------------------------------------------------------------------

test('6 tuần = đúng 6 cột, cột cuối là TUẦN NÀY', () => {
  const b = trendBuckets('6w', NOW);
  assert.equal(b.length, 6);
  assert.equal(b[5].key, '2026-W36');
  assert.equal(b[5].partial, true, 'tuần này chưa xong');
  assert.equal(b[0].partial, false);
  assert.equal(b[4].partial, false);
});

test('cột tuần đi liên tục, không nhảy cóc và không lặp', () => {
  const keys = trendBuckets('6w', NOW).map((b) => b.key);
  assert.deepEqual(keys, ['2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W36']);
});

test('mỗi cột tuần là 7 ngày, riêng cột đang chạy dừng ở HÔM NAY', () => {
  const b = trendBuckets('6w', NOW);
  assert.equal(b[0].range.from, '2026-07-27');
  assert.equal(b[0].range.to, '2026-08-02');
  // Cột cuối không kéo dài tới Chủ nhật: chưa sống tới đó thì chưa đo được.
  assert.equal(b[5].range.from, '2026-08-31');
  assert.equal(b[5].range.to, '2026-08-31');
});

// ---------------------------------------------------------------------------
// trendWindow - một query duy nhất phủ hết mọi cột
// ---------------------------------------------------------------------------

test('trendWindow ôm trọn từ cột đầu tới cột cuối', () => {
  for (const span of ['6w', '12w', '26w'] as const) {
    const b = trendBuckets(span, NOW);
    const w = trendWindow(b);
    assert.equal(w.from, b[0].range.from, `${span} from`);
    assert.equal(w.to, b[b.length - 1].range.to, `${span} to`);
    for (const x of b) {
      assert.ok(x.range.from >= w.from && x.range.to <= w.to, `${span}: ${x.key} lọt ra ngoài`);
    }
  }
});

// ---------------------------------------------------------------------------
// elapsedFraction - target của cột đang chạy phải bị chia nhỏ theo
// ---------------------------------------------------------------------------

test('cột đã xong luôn tính đủ 100% target', () => {
  const b = trendBuckets('6w', NOW);
  assert.equal(elapsedFraction(b[0], NOW), 1);
});

test('tuần này mới qua thứ Hai → khoảng 1/7 target, không phải cả tuần', () => {
  const b = trendBuckets('6w', NOW);
  const f = elapsedFraction(b[5], NOW);
  assert.ok(f > 0 && f <= 0.2, `f = ${f}`);
});

test('elapsedFraction không bao giờ vượt 1 - cột dở không thể nặng hơn cột đủ', () => {
  for (const span of ['6w', '12w', '26w'] as const) {
    for (const b of trendBuckets(span, NOW)) {
      const f = elapsedFraction(b, NOW);
      assert.ok(f > 0 && f <= 1, `${span}/${b.key} = ${f}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Kỳ trống ≠ kỳ bằng 0
//
// Bug cũ: chart đọc lên "W31 0.0h → W35 7.3h · up +7.3h" trong khi W31 app
// còn chưa dùng.
// ---------------------------------------------------------------------------

const W36 = { from: '2026-08-31', to: '2026-09-06' };

const logged = (date: string, status = 'done') => ({ status, startAt: at(date, '09:00') });

const pt = (label: string, hours: number | null, partial = false): TrendPoint => ({
  label,
  hours,
  partial,
});

test('hasLogged - kỳ có session thật thì có dữ liệu', () => {
  assert.equal(hasLogged([logged('2026-09-02')], W36), true);
});

test('hasLogged - session nằm ngoài kỳ không tính', () => {
  assert.equal(hasLogged([logged('2026-08-30'), logged('2026-09-07')], W36), false);
});

test('hasLogged - abandoned và scheduled KHÔNG phải dữ liệu', () => {
  const acts = [logged('2026-09-02', 'abandoned'), logged('2026-09-03', 'scheduled')];
  assert.equal(hasLogged(acts, W36), false);
});

test('hasLogged - kỳ rỗng thì trống, để lát nữa vẽ cột null chứ không phải 0', () => {
  assert.equal(hasLogged([], W36), false);
});

test('tuần không có dữ liệu bị loại khỏi dòng so sánh', () => {
  // W31..W33 trống, chỉ W34 và W35 có ghi.
  const cmp = trendCompare([
    pt('W31', null),
    pt('W32', null),
    pt('W33', null),
    pt('W34', 5),
    pt('W35', 7.3),
  ]);
  assert.ok(cmp);
  assert.equal(cmp.from.label, 'W34');
  assert.equal(cmp.to.label, 'W35');
  assert.equal(Math.round(cmp.diff * 10) / 10, 2.3);
  assert.equal(cmp.word, 'up');
});

test('dưới 2 tuần có dữ liệu → ẩn dòng so sánh', () => {
  assert.equal(trendCompare([pt('W34', null), pt('W35', 7.3)]), null);
  assert.equal(trendCompare([]), null);
});

test('tuần trống KHÔNG được coi là 0 giờ - không bịa ra cú tăng vọt', () => {
  const cmp = trendCompare([pt('W31', null), pt('W35', 7.3), pt('W36', 7.0)]);
  assert.ok(cmp);
  assert.equal(cmp.from.label, 'W35');
  assert.equal(cmp.word, 'flat');
});

test('kỳ đang chạy không được làm điểm cuối - nửa tuần luôn trông như đi xuống', () => {
  const cmp = trendCompare([pt('W34', 6), pt('W35', 7), pt('W36', 1, true)]);
  assert.ok(cmp);
  assert.equal(cmp.to.label, 'W35');
});

test('chênh dưới 0.5h là flat, không gọi là xu hướng', () => {
  const cmp = trendCompare([pt('W34', 7.0), pt('W35', 7.4)]);
  assert.equal(cmp?.word, 'flat');
});

test('đi xuống thì diff âm', () => {
  const cmp = trendCompare([pt('W34', 9), pt('W35', 4)]);
  assert.equal(cmp?.word, 'down');
  assert.equal(cmp?.diff, -5);
});
