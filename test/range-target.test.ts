import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PRESETS } from '@/lib/balance';
import { buildRange, customRange, weekOf, type Range } from '@/lib/range';
import { expectedForRange } from '@/lib/range-target';
import type { Category } from '@/types/logi';
import { at } from './_helpers.ts';

// 2026-08-24 là thứ Hai, 2026-08-28 là thứ Sáu.
const MON = '2026-08-24';
const FRI = '2026-08-28';
const SUN = '2026-08-30';

const NORMAL = PRESETS.normal.weekly;
const CRUNCH = PRESETS.crunch.weekly;

function map(...pairs: [string, Record<Category, number>][]) {
  return new Map(pairs);
}

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------
// Bài quan trọng nhất của Stage 5
// ---------------------------------------------------------------------------

test('T2→T6 preset Normal → Work 43h, KHÔNG phải 30.7h (chia đều)', () => {
  const range = full(MON, FRI);
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), at(SUN, '12:00'));

  // 8.0 + 9.5 + 8.0 + 9.5 + 8.0 - T3/T5 có thêm 1.5h commute.
  assert.equal(r1(exp.work), 43);

  // Cái bẫy: 43 × 5/7 = 30.7h. Nếu số này xuất hiện thì thuật toán sai.
  assert.notEqual(r1(exp.work), 30.7);
});

test('cả tuần T2→CN → đúng bằng target tuần', () => {
  const exp = expectedForRange(full(MON, SUN), map([weekOf(MON), NORMAL]), at('2026-09-01', '12:00'));
  for (const c of Object.keys(NORMAL) as Category[]) {
    assert.equal(r1(exp[c]), r1(NORMAL[c]), c);
  }
});

test('ngày cuối tuần không có Work / Fitness Chủ nhật', () => {
  const sat = full('2026-08-29', '2026-08-29');
  const sun = full(SUN, SUN);
  const now = at('2026-09-01', '12:00');
  const wTargets = map([weekOf(MON), NORMAL]);

  assert.equal(r1(expectedForRange(sat, wTargets, now).work), 0);
  assert.equal(r1(expectedForRange(sun, wTargets, now).fitness), 0);
  assert.equal(r1(expectedForRange(sat, wTargets, now).fitness), 1.5);
});

// ---------------------------------------------------------------------------
// Mỗi tuần một target riêng
// ---------------------------------------------------------------------------

test('khoảng vắt hai tuần khác preset → tổng bằng tổng hai phần', () => {
  const wA = weekOf(MON);          // 2026-W35
  const wB = weekOf('2026-08-31'); // 2026-W36
  const targets = map([wA, CRUNCH], [wB, NORMAL]);
  const now = at('2026-09-14', '12:00');

  const a = expectedForRange(full(MON, SUN), targets, now);
  const b = expectedForRange(full('2026-08-31', '2026-09-06'), targets, now);
  const both = expectedForRange(full(MON, '2026-09-06'), targets, now);

  for (const c of Object.keys(NORMAL) as Category[]) {
    assert.equal(r1(both[c]), r1(a[c] + b[c]), c);
  }
  // Crunch (57h) + Normal (43h) - không phải hai lần cùng một bộ.
  assert.equal(r1(both.work), 100);
});

test('KHÔNG dùng chung một weekTarget cho cả khoảng vắt tuần', () => {
  const wA = weekOf(MON);
  const wB = weekOf('2026-08-31');
  const mixed = expectedForRange(full(MON, '2026-09-06'), map([wA, CRUNCH], [wB, NORMAL]), at('2026-09-14', '12:00'));
  const allCrunch = expectedForRange(full(MON, '2026-09-06'), map([wA, CRUNCH], [wB, CRUNCH]), at('2026-09-14', '12:00'));

  assert.notEqual(r1(mixed.work), r1(allCrunch.work));
  assert.equal(r1(allCrunch.work), 114);
});

test('tuần không có weekTarget → rơi về PRESETS.normal', () => {
  const range = full(MON, FRI);
  const empty = expectedForRange(range, new Map(), at(SUN, '12:00'));
  const explicit = expectedForRange(range, map([weekOf(MON), NORMAL]), at(SUN, '12:00'));

  assert.equal(r1(empty.work), 43);
  for (const c of Object.keys(NORMAL) as Category[]) {
    assert.equal(r1(empty[c]), r1(explicit[c]), c);
  }
});

test('chỉ tuần thiếu mới rơi về Normal, tuần có target vẫn giữ nguyên', () => {
  const wA = weekOf(MON);
  const exp = expectedForRange(full(MON, '2026-09-06'), map([wA, CRUNCH]), at('2026-09-14', '12:00'));
  assert.equal(r1(exp.work), 57 + 43);
});

// ---------------------------------------------------------------------------
// Pro-rate: chỉ hôm nay, chỉ khi isPartial
// ---------------------------------------------------------------------------

test('isPartial giữa ngày → chỉ target hôm nay bị cắt theo dayProgress', () => {
  // 16:00 thứ Tư 2026-08-26. Ngày logic bắt đầu 04:00 → đã trôi 12/24 ngày.
  const now = at('2026-08-26', '16:00');
  const range: Range = { from: MON, to: '2026-08-26', kind: 'this_week', isPartial: true };
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);

  // T2 (8.0) + T3 (9.5) đủ, T4 (8.0) chỉ một nửa → 21.5
  assert.equal(r1(exp.work), 21.5);
});

test('isPartial = false → hôm nay vẫn tính target đầy đủ (Last week không bị cắt)', () => {
  const now = at('2026-08-26', '16:00');
  const range: Range = { from: MON, to: '2026-08-26', kind: 'custom', isPartial: false };
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), 25.5); // 8 + 9.5 + 8
});

test('KHÔNG pro-rate ngày quá khứ', () => {
  // now là 16:00 hôm nay, nhưng khoảng đã kết thúc từ hôm qua.
  const now = at('2026-08-26', '16:00');
  const range: Range = { from: MON, to: '2026-08-25', kind: 'custom', isPartial: false };
  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), 17.5); // 8 + 9.5, không bị nhân 0.5
});

test('Today lúc 02:00 sáng → là ngày hôm trước, đã trôi 22/24 giờ', () => {
  const now = at('2026-08-27', '02:00'); // ngày logic vẫn là 2026-08-26 (T4)
  const range = buildRange('today', now);
  assert.equal(range.from, '2026-08-26');
  assert.equal(range.to, '2026-08-26');
  assert.ok(range.isPartial);

  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), r1(8 * (22 / 24)));
});

// ---------------------------------------------------------------------------
// Ráp với chip thật
// ---------------------------------------------------------------------------

test('Last week luôn là tuần đầy đủ, không pro-rate', () => {
  const now = at('2026-09-02', '10:00'); // thứ Tư tuần W36
  const range = buildRange('last_week', now);
  assert.equal(range.from, MON);
  assert.equal(range.to, SUN);
  assert.equal(range.isPartial, false);

  const exp = expectedForRange(range, map([weekOf(MON), NORMAL]), now);
  assert.equal(r1(exp.work), 43);
});

test('This week giữa tuần → khoảng dừng ở hôm nay và được pro-rate', () => {
  const now = at('2026-08-26', '16:00');
  const range = buildRange('this_week', now);
  assert.equal(range.from, MON);
  assert.equal(range.to, '2026-08-26');
  assert.ok(range.isPartial);
});

test('khoảng > 92 ngày bị chặn', () => {
  const now = at('2026-08-26', '16:00');
  assert.equal(customRange('2026-01-01', '2026-08-26', now).range, null);
  assert.match(customRange('2026-01-01', '2026-08-26', now).error!, /max 3 months/);
  assert.ok(customRange('2026-06-01', '2026-08-26', now).range);
});

test('chọn ngược ngày thì tự đảo lại', () => {
  const res = customRange(FRI, MON, at('2026-09-10', '12:00'));
  assert.equal(res.range?.from, MON);
  assert.equal(res.range?.to, FRI);
});
