import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SPAN,
  TREND_SPANS,
  elapsedFraction,
  spanParts,
  trendBuckets,
  trendWindow,
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
