import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PRESETS } from '@/lib/balance';
import {
  BALANCED,
  buildReview,
  canSetNextWeek,
  pickNotes,
  planNextWeek,
  reviewDueWeek,
  weekRange,
} from '@/lib/review';
import type { RangeDeviation } from '@/lib/range-target';
import type { Category, PresetId } from '@/types/logi';
import { act, at } from './_helpers.ts';

const W35 = '2026-W35'; // Mon 2026-08-24 → Sun 2026-08-30
const W36 = '2026-W36';

const targets = (week: string, preset: PresetId = 'normal') =>
  new Map([[week, PRESETS[preset].weekly]]);

const r1 = (x: number) => Math.round(x * 10) / 10;

const row = (
  category: Category,
  actual: number,
  expected: number,
  flag: RangeDeviation['flag'] = 'over'
): RangeDeviation => ({
  category,
  actual,
  expected,
  deltaHours: actual - expected,
  deltaPct: expected > 0 ? (actual - expected) / expected : 0,
  flag,
});

// ------------------------------------------------------------
// Kích hoạt
// ------------------------------------------------------------

test('Chủ nhật 19:00 → hiện review tuần này', () => {
  assert.equal(reviewDueWeek(at('2026-08-30', '19:00'), () => false), W35);
});

test('Chủ nhật 18:59 → chưa hiện', () => {
  assert.equal(reviewDueWeek(at('2026-08-30', '18:59'), () => false), null);
});

test('đã review rồi → không hiện lại', () => {
  const now = at('2026-08-30', '20:00');
  assert.equal(reviewDueWeek(now, (w) => w === W35), null);
});

test('lỡ Chủ nhật → thứ Hai và thứ Ba vẫn mở, trỏ về tuần trước', () => {
  assert.equal(reviewDueWeek(at('2026-08-31', '10:00'), () => false), W35); // T2
  assert.equal(reviewDueWeek(at('2026-09-01', '23:00'), () => false), W35); // T3
});

test('thứ Tư trở đi → thôi, tuần đó coi như bỏ qua', () => {
  assert.equal(reviewDueWeek(at('2026-09-02', '10:00'), () => false), null);
});

test('giữa tuần không hiện banner', () => {
  assert.equal(reviewDueWeek(at('2026-08-27', '19:00'), () => false), null);
});

// ------------------------------------------------------------
// Khoảng tuần
// ------------------------------------------------------------

test('weekRange trả đúng T2 → CN', () => {
  const r = weekRange(W35, at('2026-08-31', '10:00'));
  assert.equal(r.from, '2026-08-24');
  assert.equal(r.to, '2026-08-30');
});

test('tuần đã xong → isPartial false, KHÔNG pro-rate', () => {
  assert.equal(weekRange(W35, at('2026-08-31', '10:00')).isPartial, false);
});

test('đúng tối Chủ nhật → isPartial true, target hôm đó được pro-rate', () => {
  assert.equal(weekRange(W35, at('2026-08-30', '19:00')).isPartial, true);
});

// ------------------------------------------------------------
// Màn 1 — số liệu
// ------------------------------------------------------------

test('review tuần đã xong: Work expected đúng 43h, không phải 30.7h', () => {
  const s = buildReview({
    week: W35,
    activities: [],
    weekTargets: targets(W35),
    history: [],
    now: at('2026-08-31', '10:00'),
  });
  const work = s.rows.find((x) => x.category === 'work')!;
  assert.equal(r1(work.expected), 43);
  assert.notEqual(r1(work.expected), 30.7);
});

test('title có số tuần và khoảng ngày', () => {
  const s = buildReview({
    week: W35,
    activities: [],
    weekTargets: targets(W35),
    history: [],
    now: at('2026-08-31', '10:00'),
  });
  assert.match(s.title, /^Week 35 · /);
});

test('actual cộng đúng từ record trong tuần', () => {
  const acts = [
    act({ startAt: at('2026-08-24', '09:00'), endAt: at('2026-08-24', '17:00'), category: 'work' }),
    act({ startAt: at('2026-08-25', '19:00'), endAt: at('2026-08-25', '22:00'), category: 'learn' }),
  ];
  const s = buildReview({
    week: W35,
    activities: acts,
    weekTargets: targets(W35),
    history: [],
    now: at('2026-08-31', '10:00'),
  });
  assert.equal(r1(s.rows.find((x) => x.category === 'work')!.actual), 8);
  assert.equal(r1(s.rows.find((x) => x.category === 'learn')!.actual), 3);
});

// ------------------------------------------------------------
// Màn 2 — notes
// ------------------------------------------------------------

const noteBase = {
  activities: [],
  weekTargets: targets(W35),
  week: W35,
  history: [] as { preset: PresetId }[],
  now: at('2026-08-31', '10:00'),
};

test('không có gì đáng nói → một dòng balanced', () => {
  const notes = pickNotes({
    ...noteBase,
    rows: [row('work', 43, 43, 'ok')],
    coverage: 0.8,
  });
  assert.deepEqual(notes, [BALANCED]);
});

test('tối đa hai dòng', () => {
  const notes = pickNotes({
    ...noteBase,
    rows: [row('learn', 22.4, 31, 'under'), row('work', 51.2, 43, 'over')],
    coverage: 0.2,
    history: Array(6).fill({ preset: 'crunch' as PresetId }),
  });
  assert.equal(notes.length, 2);
});

test('lệch lớn nhất theo giờ được chọn trước', () => {
  const notes = pickNotes({
    ...noteBase,
    rows: [row('leisure', 9, 6, 'over'), row('work', 51.2, 43, 'over')],
    coverage: 0.8,
  });
  assert.match(notes[0], /Work/);
});

test('flag ok không bao giờ thành note', () => {
  const notes = pickNotes({
    ...noteBase,
    rows: [row('work', 44, 43, 'ok')],
    coverage: 0.8,
  });
  assert.deepEqual(notes, [BALANCED]);
});

test('coverage thấp được nêu số', () => {
  const notes = pickNotes({ ...noteBase, rows: [], coverage: 0.41 });
  assert.match(notes[0], /41% of the week is logged/);
});

test('coverage đủ → không nhắc', () => {
  const notes = pickNotes({ ...noteBase, rows: [], coverage: 0.71 });
  assert.deepEqual(notes, [BALANCED]);
});

test('crunch streak 4/6 được nêu', () => {
  const history = [
    { preset: 'crunch' as PresetId },
    { preset: 'normal' as PresetId },
    { preset: 'crunch' as PresetId },
    { preset: 'crunch' as PresetId },
    { preset: 'normal' as PresetId },
    { preset: 'crunch' as PresetId },
  ];
  const notes = pickNotes({ ...noteBase, rows: [], coverage: 0.8, history });
  assert.match(notes[0], /Crunch: 4 of the last 6 weeks/);
});

test('OT cuối tuần được ưu tiên lên đầu', () => {
  const acts = [
    act({ startAt: at('2026-08-29', '09:00'), endAt: at('2026-08-29', '17:00'), category: 'work' }),
  ];
  const notes = pickNotes({
    ...noteBase,
    activities: acts,
    rows: [row('work', 51.2, 43, 'over')],
    coverage: 0.8,
  });
  assert.equal(notes.length, 2);
  assert.match(notes[0], /cuối tuần/);
});

// ------------------------------------------------------------
// Màn 3 — tuần tới
// ------------------------------------------------------------

test('planNextWeek trỏ đúng tuần kế tiếp', () => {
  assert.equal(planNextWeek(W35, 'normal', {}).week, W36);
});

test('không nợ → không có dòng carrying over', () => {
  assert.equal(planNextWeek(W35, 'normal', {}).debtNote, '');
});

test('có nợ → nêu rõ số giờ cộng thêm (50% theo DEBT_CARRYOVER_RATE)', () => {
  const p = planNextWeek(W35, 'normal', { learn: 6 });
  assert.match(p.debtNote, /Carrying over: Learn \+3h debt/);
  assert.equal(p.applied.learn, 3);
  // Nửa còn lại vẫn nằm trong sổ nợ, không bốc hơi.
  assert.equal(p.remaining.learn, 3);
});

test('weekly của plan giữ nguyên tổng ngân sách', () => {
  const p = planNextWeek(W35, 'deep_learn', { learn: 6 });
  const total = Object.values(p.weekly).reduce((a, b) => a + b, 0);
  assert.equal(r1(total), 135.5);
});

test('tuần đã qua → chỉ xem, không cho đặt preset', () => {
  const now = at('2026-09-14', '12:00'); // W38
  assert.equal(canSetNextWeek(W35, now), false);
  assert.equal(canSetNextWeek('2026-W37', now), true);
});
