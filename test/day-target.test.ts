import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dailyTargetFor, daySummary, LOW_RATIO } from '@/lib/day-target';
import { expectedHours, logicalWeekday } from '@/lib/balance';
import { BASELINE_WEEKLY, CATEGORIES, PRESETS, type Category } from '@/types/logi';
import { at } from './_helpers.ts';

// 0 = CN … 6 = T7
const SUN = 0;
const TUE = 2;

const zero = () =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

// --- dailyTargetFor ---------------------------------------------------------

test('dailyTargetFor: thứ Ba preset Normal → Work 9.5 (8h + 1.5h commute)', () => {
  const t = dailyTargetFor(TUE, PRESETS.normal.weekly);
  assert.equal(+t.work.toFixed(2), 9.5, 'không được ra 8.0');
  assert.equal(+t.learn.toFixed(2), 3.0);
});

test('dailyTargetFor: Chủ nhật → Learn 8.0, Fitness 0', () => {
  const t = dailyTargetFor(SUN, PRESETS.normal.weekly);
  assert.equal(+t.learn.toFixed(2), 8.0);
  assert.equal(t.fitness, 0, 'CN nghỉ tập');
});

test('dailyTargetFor: tổng 7 ngày = weekly target, với mọi preset', () => {
  for (const id of ['normal', 'crunch', 'deep_learn', 'recovery'] as const) {
    const weekly = PRESETS[id].weekly;
    for (const c of CATEGORIES) {
      let sum = 0;
      for (let dow = 0; dow < 7; dow++) sum += dailyTargetFor(dow, weekly)[c];
      assert.ok(
        Math.abs(sum - weekly[c]) < 0.001,
        `${id}/${c}: 7 ngày = ${sum.toFixed(2)} nhưng weekly = ${weekly[c]}`
      );
    }
  }
});

test('dailyTargetFor: Crunch scale đúng tỉ lệ, giữ hình dạng tuần', () => {
  const weekly = PRESETS.crunch.weekly;
  const scale = weekly.work / BASELINE_WEEKLY.work;
  const normalTue = dailyTargetFor(TUE, PRESETS.normal.weekly);
  const crunchTue = dailyTargetFor(TUE, weekly);
  assert.ok(Math.abs(crunchTue.work - normalTue.work * scale) < 0.001);
  assert.ok(crunchTue.work > normalTue.work, 'Crunch phải kéo Work lên');
});

test('dailyTargetFor: khớp với expectedHours() - không được lệch công thức', () => {
  // Thứ Ba 20:00 → đã qua T2, và T3 mới đi được một phần.
  const now = at('2026-09-01', '20:00');
  const weekly = PRESETS.normal.weekly;
  const exp = expectedHours(weekly, now);
  const todayDow = logicalWeekday(now);

  for (const c of CATEGORIES) {
    let sum = 0;
    for (let i = 1; i < 8; i++) {
      const dow = i % 7;
      if (dow === todayDow) break;
      sum += dailyTargetFor(dow, weekly)[c];
    }
    // phần hôm nay đã pro-rate nằm trong `exp`, nên chỉ so phần ngày đã trọn.
    assert.ok(sum <= exp[c] + 0.001, `${c}: ${sum} > ${exp[c]}`);
    assert.ok(exp[c] - sum <= dailyTargetFor(todayDow, weekly)[c] + 0.001, c);
  }
});

// --- daySummary -------------------------------------------------------------

test('daySummary: chưa có weekTarget → rỗng, để UI quay về dòng cũ', () => {
  assert.deepEqual(daySummary(zero(), null, TUE), []);
});

test('daySummary: CN không có Fitness và chưa log → không hiện Fitness', () => {
  const lines = daySummary(zero(), PRESETS.normal.weekly, SUN);
  assert.equal(
    lines.find((l) => l.category === 'fitness'),
    undefined
  );
  assert.ok(lines.find((l) => l.category === 'learn'), 'CN vẫn phải có Learn');
});

test('daySummary: CN không có target Fitness nhưng có log → vẫn hiện', () => {
  const actual = { ...zero(), fitness: 1 };
  const line = daySummary(actual, PRESETS.normal.weekly, SUN).find(
    (l) => l.category === 'fitness'
  );
  assert.ok(line);
  assert.equal(line.target, 0);
  assert.equal(line.low, false, 'target 0 thì không thể "thiếu"');
});

test('daySummary: không có doneBefore → mẫu số là standard, không nhảy số', () => {
  const actual = { ...zero(), work: 4 };
  const ls = daySummary(actual, PRESETS.normal.weekly, TUE);
  const w = ls.find((l) => l.category === 'work')!;
  assert.equal(+w.target.toFixed(2), 9.5);
  assert.equal(+w.standard.toFixed(2), 9.5);
});

test('daySummary: có doneBefore → mẫu số là gợi ý bù, standard vẫn giữ nguyên', () => {
  const weekly = PRESETS.normal.weekly;
  // Thứ Hai học 10h, standard chỉ 3h → thứ Ba phải nhẹ đi.
  const before = { ...zero(), learn: 10 };
  const ls = daySummary(zero(), weekly, TUE, before);
  const l = ls.find((c) => c.category === 'learn')!;
  assert.equal(+l.standard.toFixed(1), 3, 'standard không đổi');
  assert.ok(l.target < l.standard, `bù rồi thì nhẹ hơn, target=${l.target}`);
});

test('daySummary: dưới 50% target → low; đạt hoặc vượt → không low', () => {
  const weekly = PRESETS.normal.weekly;
  const target = dailyTargetFor(TUE, weekly).work; // 9.5

  const under = daySummary({ ...zero(), work: target * LOW_RATIO - 0.1 }, weekly, TUE);
  assert.equal(under.find((l) => l.category === 'work')!.low, true);

  const onEdge = daySummary({ ...zero(), work: target * LOW_RATIO }, weekly, TUE);
  assert.equal(onEdge.find((l) => l.category === 'work')!.low, false);

  const over = daySummary({ ...zero(), work: target + 2 }, weekly, TUE);
  assert.equal(over.find((l) => l.category === 'work')!.low, false);
});
