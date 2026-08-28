// Stage 4.6 - phần hình thức nào tách được ra hàm thuần thì test ở đây.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gaugeShape } from '@/lib/day-target';
import { budgetMessages, PRESET_HINT } from '@/lib/copy';
import { catInk, catTint } from '@/lib/category-style';
import { validateTargets } from '@/lib/balance';
import { CATEGORIES, HARD_FLOOR, PRESETS, TOTAL_BUDGET } from '@/types/logi';

// --- Gauge (Task 4) ---------------------------------------------------

test('gauge: fill = actual / target', () => {
  const g = gaugeShape(1.6, 3.2);
  assert.equal(g.fill, 0.5);
  assert.equal(g.over, false);
  assert.equal(g.noTarget, false);
  assert.equal(g.dim, false);
});

test('gauge: vượt target → thanh đầy + vạch hổ phách, KHÔNG tràn', () => {
  const g = gaugeShape(9, 3);
  assert.equal(g.fill, 1, 'fill phải bị chặn ở 1');
  assert.equal(g.over, true);
});

test('gauge: đúng bằng target thì chưa tính là vượt', () => {
  const g = gaugeShape(3, 3);
  assert.equal(g.fill, 1);
  assert.equal(g.over, false);
});

test('gauge: target 0 (Fitness Chủ nhật) → không vẽ thanh', () => {
  const g = gaugeShape(1.5, 0);
  assert.equal(g.noTarget, true);
  assert.equal(g.fill, 0);
  assert.equal(g.over, false, 'không có target thì không có gì để vượt');
  assert.equal(g.dim, false, 'có log thì vẫn phải đọc được');
});

test('gauge: không target, không log → làm mờ cả ô', () => {
  assert.equal(gaugeShape(0, 0).dim, true);
});

test('gauge: fill không bao giờ âm hay NaN', () => {
  for (const [a, t] of [
    [0, 3],
    [0, 0],
    [5, 0],
    [-1, 3],
  ] as const) {
    const g = gaugeShape(a, t);
    assert.ok(Number.isFinite(g.fill), `NaN với (${a}, ${t})`);
    assert.ok(g.fill >= 0 && g.fill <= 1, `ngoài khoảng với (${a}, ${t})`);
  }
});

// --- Chữ tiếng Anh (Task 6) -------------------------------------------

test('mọi preset đều có hint tiếng Anh', () => {
  for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const hint = PRESET_HINT[id];
    assert.ok(hint, `thiếu hint cho ${id}`);
    // Dấu thanh tiếng Việt nằm ngoài Latin-1 cơ bản.
    assert.doesNotMatch(hint, /[À-ỹ]/, `${id} còn tiếng Việt: ${hint}`);
  }
});

test('budgetMessages: vượt ngân sách nói rõ thừa bao nhiêu', () => {
  const over = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work + 3 };
  const msgs = budgetMessages(over);
  assert.equal(msgs[0], 'Over by 3.0h — reduce another category');
});

test('budgetMessages: còn thừa giờ chưa phân bổ', () => {
  const under = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work - 3 };
  assert.equal(budgetMessages(under)[0], '3.0h unallocated');
});

test('budgetMessages: chạm sàn thì nói tên category', () => {
  const floor = HARD_FLOOR.fitness ?? 0;
  const bad = { ...PRESETS.normal.weekly, fitness: floor - 1, work: PRESETS.normal.weekly.work + 1 };
  const msgs = budgetMessages(bad);
  assert.ok(
    msgs.some((m) => m.includes('Fitness') && m.includes('below')),
    `không nhắc Fitness: ${msgs.join(' | ')}`,
  );
});

test('budgetMessages im lặng đúng lúc validateTargets nói ok', () => {
  // Câu chữ ở copy.ts, nhưng LUẬT vẫn phải là của balance.ts.
  for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const w = PRESETS[id].weekly;
    assert.equal(
      budgetMessages(w).length === 0,
      validateTargets(w).ok,
      `lệch nhau ở preset ${id}`,
    );
  }
});

test('tổng preset vẫn đúng ngân sách - copy.ts không đụng vào số', () => {
  for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const total = CATEGORIES.reduce((a, c) => a + PRESETS[id].weekly[c], 0);
    assert.ok(Math.abs(total - TOTAL_BUDGET) < 0.11, `${id} lệch: ${total}`);
  }
});

// --- Token màu (Task 1) -----------------------------------------------

test('tint/ink trả về CSS var, không phải hex - để dark mode tự đổi', () => {
  for (const c of CATEGORIES) {
    assert.match(catTint(c), /^var\(--cat-[a-z]+-tint\)$/);
    assert.match(catInk(c), /^var\(--cat-[a-z]+-ink\)$/);
    assert.doesNotMatch(catTint(c), /#[0-9a-f]{6}/i);
  }
});
