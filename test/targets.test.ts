import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dragBounds, MAX_PINNED, rebalance, validateTargets } from '@/lib/balance';
import {
  TargetError,
  WEEK_CLOSED,
  assertOpen,
  assertValid,
  previewSwitch,
  totalDebt,
} from '@/lib/target-rules';
import { type Weekly } from '@/lib/rollover';
import { isLateChange } from '@/lib/week';
import {
  CATEGORIES,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type WeekTarget,
} from '@/types/logi';
import { at } from './_helpers.ts';

const total = (w: Weekly) => CATEGORIES.reduce((a, c) => a + w[c], 0);

function wt(over: Partial<WeekTarget> = {}): WeekTarget {
  return {
    week: '2026-W36',
    preset: 'normal',
    weekly: { ...PRESETS.normal.weekly },
    debtApplied: {},
    changedAt: 0,
    lateChange: false,
    lockedAt: null,
    ...over,
  };
}

// 2026-W36 = tuần của 2026-08-31 (T2) đến 2026-09-06 (CN).
const TUE = at('2026-09-01', '10:00');
const FRI = at('2026-09-04', '10:00');
const SUN_2200 = at('2026-09-06', '22:00');

// --- Tuần đã khoá -----------------------------------------------------

test('tuần đã ghi lockedAt → throw', () => {
  assert.throws(() => assertOpen(wt({ lockedAt: 1 }), '2026-W36', TUE), (e: unknown) => {
    assert.ok(e instanceof TargetError);
    assert.equal(e.code, 'locked');
    assert.equal(e.message, WEEK_CLOSED);
    return true;
  });
});

test('qua 21:00 CN mà chưa kịp ghi lockedAt → vẫn throw', () => {
  // Khoá lười: không có cron, nên mốc thời gian mới là nguồn sự thật.
  assert.throws(() => assertOpen(wt(), '2026-W36', SUN_2200), TargetError);
});

test('tuần đang mở → không throw', () => {
  assertOpen(wt(), '2026-W36', TUE);
  assertOpen(null, '2026-W36', TUE);
});

test('tuần cũ luôn đóng, kể cả doc chưa tồn tại', () => {
  assert.throws(() => assertOpen(null, '2026-W30', TUE), TargetError);
});

// --- lateChange -------------------------------------------------------

test('sửa thứ Sáu → lateChange true; thứ Ba → false', () => {
  assert.equal(isLateChange(FRI), true);
  assert.equal(isLateChange(TUE), false);
});

test('sửa T7 và CN cũng là muộn', () => {
  assert.equal(isLateChange(at('2026-09-05', '10:00')), true);
  assert.equal(isLateChange(at('2026-09-06', '10:00')), true);
});

test('02:00 sáng thứ Bảy vẫn tính là thứ Sáu (ngày logic)', () => {
  assert.equal(isLateChange(at('2026-09-05', '02:00')), true);
  // Còn 02:00 sáng thứ Tư thì thuộc thứ Ba → chưa muộn.
  assert.equal(isLateChange(at('2026-09-02', '02:00')), false);
});

// --- rebalance chạm sàn ----------------------------------------------

test('rebalance: kéo Work lên thì các category khác tự giảm, tổng giữ nguyên', () => {
  const out = rebalance(PRESETS.normal.weekly, 'work', 51);
  assert.equal(out.work, 51);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11, `tổng = ${total(out)}`);
  assert.ok(out.fitness >= 4.5, 'sàn Fitness 4.5h vẫn được tôn trọng');
});

test('rebalance: không đẩy category nào xuống dưới HARD_FLOOR', () => {
  // Kéo Work lên rất cao - phần bù phải dừng ở sàn, không âm.
  const out = rebalance(PRESETS.normal.weekly, 'work', 90);
  for (const c of CATEGORIES) {
    assert.ok(out[c] >= (HARD_FLOOR[c] ?? 0) - 0.001, `${c} = ${out[c]} thủng sàn`);
  }
});

test('rebalance: hết chỗ cắt thì thà lệch ngân sách còn hơn thủng sàn', () => {
  const out = rebalance(PRESETS.normal.weekly, 'work', 90);
  assert.equal(out.work, 90);
  assert.ok(total(out) > TOTAL_BUDGET, 'validateTargets sẽ bắt lỗi này ở bước sau');
  assert.equal(validateTargets(out).ok, false);
});

test('rebalance: kéo Fitness xuống 3h thì `min` của slider mới là thứ chặn', () => {
  // rebalance nhận đúng giá trị được truyền vào; sàn do UI chặn trước.
  const floor = HARD_FLOOR.fitness ?? 0;
  const out = rebalance(PRESETS.normal.weekly, 'fitness', floor);
  assert.equal(out.fitness, floor);
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.11);
});

// --- validateTargets --------------------------------------------------

test('validateTargets: vượt ngân sách bị bắt', () => {
  const over = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work + 5 };
  const check = validateTargets(over);
  assert.equal(check.ok, false);
  assert.ok(check.errors.length > 0);
});

test('validateTargets: thiếu ngân sách cũng bị bắt', () => {
  const under = { ...PRESETS.normal.weekly, work: PRESETS.normal.weekly.work - 5 };
  assert.equal(validateTargets(under).ok, false);
});

test('validateTargets: bốn preset gốc đều hợp lệ', () => {
  for (const id of ['normal', 'crunch', 'deep_learn', 'recovery'] as const) {
    const check = validateTargets(PRESETS[id].weekly);
    assert.ok(check.ok, `${id}: ${check.errors.join(' ')}`);
  }
});

test('assertValid ném TargetError code invalid', () => {
  assert.throws(
    () => assertValid({ ...PRESETS.normal.weekly, work: 99 }),
    (e: unknown) => e instanceof TargetError && e.code === 'invalid'
  );
});

// --- previewSwitch ----------------------------------------------------

test('previewSwitch: đổi sang Crunch thì nêu rõ nợ phát sinh', () => {
  const rows = previewSwitch(PRESETS.normal.weekly, 'crunch', {});
  const learn = rows.find((r) => r.category === 'learn')!;
  assert.equal(learn.from, PRESETS.normal.weekly.learn);
  assert.equal(learn.to, PRESETS.crunch.weekly.learn);
  assert.equal(learn.debt, PRESETS.normal.weekly.learn - PRESETS.crunch.weekly.learn);
});

test('previewSwitch: về Normal thì không phát sinh nợ mới', () => {
  const rows = previewSwitch(PRESETS.crunch.weekly, 'normal', {});
  for (const r of rows) assert.equal(r.debt, 0);
});

test('previewSwitch: nợ tính theo BASELINE, không theo tuần hiện tại', () => {
  // Đang ở Crunch rồi đổi sang Crunch: `from` không đổi nhưng nợ vẫn
  // là phần cắt so với Normal - nếu tính theo `from` thì nợ sẽ ra 0 sai.
  const rows = previewSwitch(PRESETS.crunch.weekly, 'crunch', {});
  const learn = rows.find((r) => r.category === 'learn')!;
  assert.ok(learn.debt > 0);
});

test('previewSwitch: cộng lại debtApplied, không tiêu nợ thêm lần nữa', () => {
  // Nợ Learn = tuần này phải học BÙ, nên target Learn phải cao hơn.
  const plain = previewSwitch(PRESETS.normal.weekly, 'normal', {});
  const withDebt = previewSwitch(PRESETS.normal.weekly, 'normal', { learn: 6 });
  const a = plain.find((r) => r.category === 'learn')!;
  const b = withDebt.find((r) => r.category === 'learn')!;
  assert.ok(b.to > a.to, 'phần nợ đã trả tuần này phải được giữ lại');
  assert.ok(b.debt < a.debt || a.debt === 0, 'học bù nhiều hơn thì nợ mới ít đi');
});

test('totalDebt cộng mọi category', () => {
  assert.equal(totalDebt({}), 0);
  assert.equal(totalDebt({ learn: 12, fitness: 3 }), 15);
});

// ---------------------------------------------------------------------------
// Ghim category (pin) - kéo cái này thì không được lấy giờ của cái kia
// ---------------------------------------------------------------------------

test('ghim Learn: kéo Work lên thì Learn không suy suyển', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'work', w.work + 6, ['learn']);
  assert.equal(out.learn, w.learn, 'Learn bị lấy mất giờ dù đã ghim');
  assert.ok(Math.abs(total(out) - TOTAL_BUDGET) < 0.05, 'tổng vẫn phải là 89h');
});

test('ghim chính cái đang kéo thì bị bỏ qua - không ai tự khoá tay mình', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'work', w.work + 4, ['work', 'learn']);
  assert.equal(out.work, w.work + 4);
  assert.equal(out.learn, w.learn);
});

test('ghim 3 cái: cái thứ tư là phần còn lại, kéo nó không đổi được gì', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'leisure', 20, ['work', 'learn', 'fitness']);
  assert.deepEqual(out, w, 'không có ai bù thì thà đứng yên còn hơn lệch 89h');
});

test('dragBounds: không ghim gì thì trần là 89h trừ sàn của ba cái kia', () => {
  const w = PRESETS.normal.weekly;
  const floors = CATEGORIES.filter((c) => c !== 'work').reduce(
    (a, c) => a + (HARD_FLOOR[c] ?? 0),
    0
  );
  assert.deepEqual(dragBounds(w, 'work'), {
    min: HARD_FLOOR.work ?? 0,
    max: TOTAL_BUDGET - floors,
  });
});

test('dragBounds: mỗi cái ghim thêm là trần của cái đang kéo tụt xuống', () => {
  const w = PRESETS.normal.weekly;
  const free = dragBounds(w, 'work').max;
  const one = dragBounds(w, 'work', ['learn']).max;
  const two = dragBounds(w, 'work', ['learn', 'leisure']).max;
  assert.ok(one < free, `${one} phải nhỏ hơn ${free}`);
  assert.ok(two < one, `${two} phải nhỏ hơn ${one}`);
});

test('kéo tới đúng trần của dragBounds thì ngân sách vẫn khớp 89h', () => {
  const w = PRESETS.normal.weekly;
  for (const c of CATEGORIES) {
    const pinned = CATEGORIES.filter((x) => x !== c).slice(0, 2);
    const { max } = dragBounds(w, c, pinned);
    const out = rebalance(w, c, max, pinned);
    assert.ok(
      Math.abs(total(out) - TOTAL_BUDGET) < 0.05,
      `kéo ${c} lên trần ${max} → tổng ${total(out)}`
    );
    assert.equal(validateTargets(out).ok, true, `${c} ở trần mà vẫn báo lỗi`);
  }
});

test('ghim rồi kéo vẫn không ai thủng sàn', () => {
  const w = PRESETS.normal.weekly;
  const out = rebalance(w, 'learn', 70, ['work']);
  for (const c of CATEGORIES) {
    assert.ok(out[c] >= (HARD_FLOOR[c] ?? 0) - 0.001, `${c} = ${out[c]} thủng sàn`);
  }
});

test('MAX_PINNED là 3 - ghim cả bốn thì không còn gì để kéo', () => {
  assert.equal(MAX_PINNED, CATEGORIES.length - 1);
});
