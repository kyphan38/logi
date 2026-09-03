import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SPAN,
  TREND_SPANS,
  elapsedFraction,
  hasLogged,
  spanParts,
  trendBuckets,
  trendCompare,
  trendWindow,
  type TrendPoint,
} from '@/lib/trend';
import { at } from './_helpers.ts';

// Thứ Hai 2026-08-31, 12:00. Tuần logic: 2026-W36.
const NOW = at('2026-08-31', '12:00');

// ---------------------------------------------------------------------------
// spanParts
// ---------------------------------------------------------------------------

test('spanParts: đọc được cả 4 span trong dropdown', () => {
  assert.deepEqual(spanParts('3w'), { unit: 'week', count: 3 });
  assert.deepEqual(spanParts('6w'), { unit: 'week', count: 6 });
  assert.deepEqual(spanParts('3m'), { unit: 'month', count: 3 });
  assert.deepEqual(spanParts('6m'), { unit: 'month', count: 6 });
});

test('spanParts: mọi span trong TREND_SPANS đều hợp lệ', () => {
  for (const s of TREND_SPANS) {
    const p = spanParts(s.value);
    assert.ok(p.count > 0, `${s.value} count = ${p.count}`);
    assert.ok(p.unit === 'week' || p.unit === 'month');
  }
});

test('DEFAULT_SPAN nằm trong danh sách - không mở ra một dropdown trống', () => {
  assert.ok(TREND_SPANS.some((s) => s.value === DEFAULT_SPAN));
});

// ---------------------------------------------------------------------------
// trendBuckets - tuần
// ---------------------------------------------------------------------------

test('3 tuần = đúng 3 cột, cột cuối là TUẦN NÀY', () => {
  const b = trendBuckets('3w', NOW);
  assert.equal(b.length, 3);
  assert.equal(b[2].key, '2026-W36');
  assert.equal(b[2].partial, true, 'tuần này chưa xong');
  assert.equal(b[0].partial, false);
  assert.equal(b[1].partial, false);
});

test('cột tuần đi liên tục, không nhảy cóc và không lặp', () => {
  const keys = trendBuckets('6w', NOW).map((b) => b.key);
  assert.deepEqual(keys, ['2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W36']);
});

test('mỗi cột tuần là 7 ngày, riêng cột đang chạy dừng ở HÔM NAY', () => {
  const b = trendBuckets('3w', NOW);
  assert.equal(b[0].range.from, '2026-08-17');
  assert.equal(b[0].range.to, '2026-08-23');
  // Cột cuối không kéo dài tới Chủ nhật: chưa sống tới đó thì chưa đo được.
  assert.equal(b[2].range.from, '2026-08-31');
  assert.equal(b[2].range.to, '2026-08-31');
});

// ---------------------------------------------------------------------------
// trendBuckets - tháng
// ---------------------------------------------------------------------------

test('3 tháng = 3 cột, cột cuối là tháng này và đang dở', () => {
  const b = trendBuckets('3m', NOW);
  assert.deepEqual(
    b.map((x) => x.key),
    ['2026-06', '2026-07', '2026-08']
  );
  assert.deepEqual(
    b.map((x) => x.label),
    ['Jun', 'Jul', 'Aug']
  );
  assert.equal(b[2].partial, true);
});

test('cột tháng trọn vẹn chạy hết ngày cuối tháng, kể cả tháng 30 ngày', () => {
  const b = trendBuckets('3m', NOW);
  assert.equal(b[0].range.from, '2026-06-01');
  assert.equal(b[0].range.to, '2026-06-30');
  assert.equal(b[1].range.to, '2026-07-31');
});

test('6 tháng bước qua ranh giới năm mà không nhảy về tháng 13', () => {
  const b = trendBuckets('6m', at('2026-02-15', '12:00'));
  assert.deepEqual(
    b.map((x) => x.key),
    ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  );
});

test('tháng Hai năm nhuận vẫn ra 29 ngày', () => {
  const b = trendBuckets('3m', at('2024-03-10', '12:00'));
  const feb = b.find((x) => x.key === '2024-02');
  assert.ok(feb);
  assert.equal(feb.range.to, '2024-02-29');
});

// ---------------------------------------------------------------------------
// trendWindow - một query duy nhất phủ hết mọi cột
// ---------------------------------------------------------------------------

test('trendWindow ôm trọn từ cột đầu tới cột cuối', () => {
  for (const span of ['3w', '6w', '3m', '6m'] as const) {
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
  const b = trendBuckets('3w', NOW);
  const f = elapsedFraction(b[2], NOW);
  assert.ok(f > 0 && f <= 0.2, `f = ${f}`);
});

test('tháng này ngày 31 → gần trọn tháng', () => {
  const b = trendBuckets('3m', NOW);
  const f = elapsedFraction(b[2], NOW);
  assert.ok(f > 0.9 && f <= 1, `f = ${f}`);
});

test('elapsedFraction không bao giờ vượt 1 - cột dở không thể nặng hơn cột đủ', () => {
  for (const span of ['3w', '6w', '3m', '6m'] as const) {
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
