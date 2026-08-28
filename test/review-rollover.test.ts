// ============================================================
// Ràng buộc cứng của Stage 6 Task 1:
// Weekly Review tạo target tuần sau TRƯỚC khi rollover chạy.
// Rollover của Stage 4 phải nhìn thấy doc đó và ĐỂ YÊN.
//
// Test này dựng lại đúng chuỗi việc thật: review tối CN → rollover sáng T2.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planNextWeek } from '@/lib/review';
import {
  applyPlan,
  planRollover,
  type RolloverState,
  type WeekTargetSeed,
} from '@/lib/rollover';
import type { WeekTarget } from '@/types/logi';
import { at } from './_helpers.ts';

const W35 = '2026-W35';
const W36 = '2026-W36';

const SUNDAY = at('2026-08-30', '19:30'); // lúc chạy review
const MONDAY = at('2026-08-31', '08:00'); // lúc rollover chạy

/** Doc weekTargets như Firestore sẽ lưu. */
function target(week: string, wt: Partial<WeekTarget> = {}): WeekTarget {
  return {
    week,
    preset: 'normal',
    weekly: { sleep: 46.5, work: 43, learn: 31, fitness: 9, leisure: 6 },
    debtApplied: {},
    changedAt: SUNDAY,
    lateChange: false,
    lockedAt: null,
    ...wt,
  };
}

/** Đúng cái mà `setupNextWeek()` sẽ ghi ra. */
function fromReview(seed: ReturnType<typeof planNextWeek>): WeekTarget {
  return target(seed.week, {
    preset: seed.preset,
    weekly: seed.weekly,
    debtApplied: seed.applied,
  });
}

test('review chọn Deep Learn cho tuần sau → rollover KHÔNG ghi đè', () => {
  const debt = { learn: 6 };
  const plan36 = planNextWeek(W35, 'deep_learn', debt);

  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: plan36.remaining, // review đã tiêu 50% nợ
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const plan = planRollover(state);

  assert.deepEqual(plan.creates, [] as WeekTargetSeed[]);
  assert.deepEqual(plan.processed, [W35]);
  assert.deepEqual(plan.locks, [W35]); // tuần cũ vẫn được đóng sổ
  assert.equal(plan.lastProcessedWeek, W36);
});

test('preset và debtApplied của review sống sót qua rollover', () => {
  const plan36 = planNextWeek(W35, 'deep_learn', { learn: 6 });
  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: plan36.remaining,
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const after = applyPlan(state, planRollover(state));
  const w36 = after.targets[W36]!;

  assert.equal(w36.preset, 'deep_learn');
  assert.equal(w36.debtApplied.learn, 3);
  assert.equal(w36.weekly.learn, plan36.weekly.learn);
});

test('nợ không bị tiêu hai lần: review tiêu 50%, rollover không tiêu thêm', () => {
  const plan36 = planNextWeek(W35, 'normal', { learn: 6 });
  assert.equal(plan36.applied.learn, 3);
  assert.equal(plan36.remaining.learn, 3);

  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: plan36.remaining,
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const after = applyPlan(state, planRollover(state));

  // Rollover có accrue nợ MỚI từ tuần W35 (đó là việc của nó),
  // nhưng không được đụng lại vào 3h còn lại của lần trước.
  assert.ok((after.debt.learn ?? 0) >= 3, 'phần nợ còn lại phải nguyên vẹn');
  assert.equal(after.targets[W36]!.debtApplied.learn, 3);
});

test('chạy rollover lần hai → không làm gì nữa (idempotent)', () => {
  const plan36 = planNextWeek(W35, 'crunch', {});
  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: {},
    targets: { [W35]: target(W35), [W36]: fromReview(plan36) },
    now: MONDAY,
  };

  const after = applyPlan(state, planRollover(state));
  const second = planRollover(after);

  assert.equal(second.reason, 'same-week');
  assert.deepEqual(second.creates, []);
  assert.deepEqual(second.locks, []);
  assert.equal(after.targets[W36]!.preset, 'crunch');
});

test('KHÔNG review → rollover vẫn tự tạo target Normal như cũ', () => {
  const state: RolloverState = {
    currentWeek: W36,
    lastProcessedWeek: W35,
    debt: {},
    targets: { [W35]: target(W35), [W36]: null },
    now: MONDAY,
  };

  const plan = planRollover(state);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].week, W36);
  assert.equal(plan.creates[0].preset, 'normal');
});

test('review tuần này rồi bỏ app hai tuần → tuần giữa không bị đè', () => {
  const plan36 = planNextWeek(W35, 'recovery', {});
  const state: RolloverState = {
    currentWeek: '2026-W37',
    lastProcessedWeek: W35,
    debt: {},
    targets: { [W35]: target(W35), [W36]: fromReview(plan36), '2026-W37': null },
    now: at('2026-09-07', '08:00'),
  };

  const after = applyPlan(state, planRollover(state));

  assert.equal(after.targets[W36]!.preset, 'recovery'); // vẫn nguyên
  assert.equal(after.targets['2026-W37']!.preset, 'normal'); // tuần mới mới được tạo
});
