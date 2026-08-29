import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rebalance } from '@/lib/balance';
import {
  BASELINE_WEEKLY,
  CATEGORIES,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type Category,
} from '@/types/logi';

// ---------------------------------------------------------------------------
// Ngân sách zero-sum sau khi bỏ Sleep (AMENDMENT-remove-sleep mục 2 + 12).
// ---------------------------------------------------------------------------

const total = (w: Record<Category, number>) => CATEGORIES.reduce((s, c) => s + w[c], 0);

const PRESET_IDS = ['normal', 'crunch', 'deep_learn', 'recovery'] as const;

test('TOTAL_BUDGET = 89h, không còn 135.5h', () => {
  assert.equal(TOTAL_BUDGET, 89);
  assert.equal(total(BASELINE_WEEKLY), 89);
});

test('bốn category, không có sleep', () => {
  assert.deepEqual([...CATEGORIES].sort(), ['fitness', 'learn', 'leisure', 'work']);
  assert.equal('sleep' in BASELINE_WEEKLY, false);
});

test('cả 4 preset cộng đúng 89h', () => {
  for (const id of PRESET_IDS) {
    const w = PRESETS[id].weekly;
    assert.equal(total(w), TOTAL_BUDGET, `${id} = ${total(w)}h`);
    assert.equal('sleep' in w, false, `${id} vẫn còn sleep`);
  }
});

test('rebalance: kéo một category lên thì 3 category kia cùng gánh', () => {
  const base = PRESETS.normal.weekly;
  const out = rebalance(base, 'learn', base.learn + 6);

  assert.equal(out.learn, base.learn + 6);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11, `tổng = ${total(out)}`);

  // Chia đều: không ai bị bỏ qua, không ai gánh hết.
  for (const c of CATEGORIES) {
    if (c === 'learn') continue;
    assert.ok(out[c] < base[c], `${c} phải giảm`);
  }
});

test('rebalance: sàn Fitness 4.5h không bao giờ bị phá', () => {
  const base = PRESETS.normal.weekly;
  const floor = HARD_FLOOR.fitness ?? 0;
  assert.equal(floor, 4.5);

  // Kéo Work lên rất cao - phần bù phải dừng ở sàn, không âm.
  const out = rebalance(base, 'work', 80);
  assert.ok(out.fitness >= floor, `fitness = ${out.fitness}`);
  for (const c of CATEGORIES) assert.ok(out[c] >= 0, `${c} âm`);
});

test('rebalance: kéo xuống thì 3 category kia nhận lại, tổng vẫn 89h', () => {
  const base = PRESETS.normal.weekly;
  const out = rebalance(base, 'work', base.work - 9);

  assert.equal(out.work, base.work - 9);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11, `tổng = ${total(out)}`);
  for (const c of CATEGORIES) {
    if (c === 'work') continue;
    assert.ok(out[c] > base[c], `${c} phải tăng`);
  }
});
