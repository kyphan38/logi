import { test } from 'node:test';
import assert from 'node:assert/strict';

import { logicalWeek, validateTargets } from '@/lib/balance';
import {
  MAX_ROLLOVER_WEEKS,
  applyPlan,
  buildWeekly,
  planRollover,
  reapplyDebt,
  roundToBudget,
  settleWithinBudget,
  weeksToRead,
  type DebtBalance,
  type RolloverState,
  type Weekly,
} from '@/lib/rollover';
import {
  addWeeks,
  isLateChange,
  isWeekClosed,
  weekDiff,
  weekLabel,
  weekLockAt,
  weekStart,
} from '@/lib/week';
import {
  BASELINE_WEEKLY,
  CATEGORIES,
  PRESETS,
  TOTAL_BUDGET,
  type PresetId,
  type WeekTarget,
} from '@/types/logi';
import { at } from './_helpers.ts';

const total = (w: Weekly) => CATEGORIES.reduce((a, c) => a + w[c], 0);

function wt(week: string, preset: PresetId, lockedAt: number | null = null): WeekTarget {
  return {
    week,
    preset,
    weekly: { ...PRESETS[preset].weekly },
    debtApplied: {},
    changedAt: 0,
    lateChange: false,
    lockedAt,
  };
}

function state(o: Partial<RolloverState> & { currentWeek: string }): RolloverState {
  return {
    lastProcessedWeek: null,
    debt: {},
    targets: {},
    now: at('2026-08-31', '07:00'),
    ...o,
  };
}

// --- Số học tuần -----------------------------------------------------

test('weekStart: rơi vào thứ Hai, và logicalWeek() đọc ngược lại đúng tên tuần', () => {
  for (const w of ['2026-W01', '2026-W35', '2026-W52', '2027-W01']) {
    const ts = weekStart(w);
    assert.equal(new Date(ts).getDay(), 1, `${w} phải là thứ Hai`);
    assert.equal(logicalWeek(ts), w);
  }
});

test('addWeeks: qua năm vẫn đúng', () => {
  assert.equal(addWeeks('2026-W35', 1), '2026-W36');
  assert.equal(addWeeks('2026-W35', -1), '2026-W34');
  assert.equal(addWeeks('2026-W52', 1), '2026-W53');
  assert.equal(weekDiff('2026-W50', addWeeks('2026-W50', 5)), 5);
});

test('weekLockAt: 21:00 Chủ nhật, không phải Chủ nhật đầu tuần', () => {
  const lock = new Date(weekLockAt('2026-W35'));
  assert.equal(lock.getDay(), 0, 'phải là Chủ nhật');
  assert.equal(lock.getHours(), 21);
  assert.ok(lock.getTime() > weekStart('2026-W35'), 'Chủ nhật phải nằm SAU thứ Hai');

  assert.equal(isWeekClosed('2026-W35', lock.getTime() - 1), false);
  assert.equal(isWeekClosed('2026-W35', lock.getTime()), true);
});

test('isLateChange: T6/T7/CN là muộn, T2–T5 thì không', () => {
  assert.equal(isLateChange(at('2026-08-31', '10:00')), false, 'thứ Hai');
  assert.equal(isLateChange(at('2026-09-03', '10:00')), false, 'thứ Năm');
  assert.equal(isLateChange(at('2026-09-04', '10:00')), true, 'thứ Sáu');
  assert.equal(isLateChange(at('2026-09-06', '10:00')), true, 'Chủ nhật');
  // 02:00 Chủ nhật vẫn là thứ Bảy theo mốc cắt 04:00 → vẫn muộn.
  assert.equal(isLateChange(at('2026-09-06', '02:00')), true);
});

test('weekLabel: nhãn ngắn cho card', () => {
  assert.equal(weekLabel('2026-W35'), 'W35');
});

// --- Trả nợ mà vẫn giữ ngân sách 89h ---------------------------------

test('settleWithinBudget: trả nợ Learn nhưng tổng vẫn đúng 89h', () => {
  const out = settleWithinBudget(PRESETS.normal.weekly, { learn: 6 });
  assert.equal(total(out), TOTAL_BUDGET);
  assert.equal(out.learn, 37, 'Learn phải nhận đủ 6h nợ');
  assert.ok(validateTargets(out).ok, validateTargets(out).errors.join(' '));
});

test('settleWithinBudget: không cắt xuống dưới sàn cứng', () => {
  const out = settleWithinBudget(PRESETS.normal.weekly, { learn: 10, fitness: 8 });
  assert.ok(out.fitness >= 4.5);
  assert.ok(validateTargets(out).ok, validateTargets(out).errors.join(' '));
});

test('buildWeekly: trả 50% nợ, phần còn lại giữ trong sổ', () => {
  const { weekly, applied, remaining } = buildWeekly(PRESETS.normal.weekly, { learn: 12 });
  assert.equal(applied.learn, 6, '50% của 12h');
  assert.equal(remaining.learn, 6);
  assert.equal(total(weekly), TOTAL_BUDGET);
});

test('buildWeekly: nợ khổng lồ vẫn bị trần 10h chặn lại', () => {
  const { applied } = buildWeekly(PRESETS.normal.weekly, { learn: 100 });
  assert.equal(applied.learn, 10, 'trần 10h/tuần');
});

test('reapplyDebt: đổi preset không tiêu thêm nợ', () => {
  const first = buildWeekly(PRESETS.normal.weekly, { learn: 12 });
  const switched = reapplyDebt(PRESETS.deep_learn.weekly, first.applied);
  assert.equal(total(switched), TOTAL_BUDGET);
  assert.equal(switched.learn, PRESETS.deep_learn.weekly.learn + 6, 'vẫn đúng 6h đã trả');
});

test('roundToBudget: sai số dấu phẩy động không làm validateTargets trượt', () => {
  const messy: Weekly = { work: 43.333333, learn: 31.333333, fitness: 8.966667, leisure: 5.7 };
  const out = roundToBudget(messy);
  assert.equal(total(out), TOTAL_BUDGET);
  assert.ok(validateTargets(out).ok);
});

// --- weeksToRead: đọc trước khi ghi (luật transaction Firestore) ------

test('weeksToRead: gồm tuần hiện tại và mọi tuần chưa xử lý', () => {
  const got = weeksToRead('2026-W35', '2026-W32');
  assert.deepEqual([...got].sort(), ['2026-W32', '2026-W33', '2026-W34', '2026-W35']);
});

test('weeksToRead: lần đầu chạy chỉ cần tuần hiện tại', () => {
  assert.deepEqual(weeksToRead('2026-W35', null), ['2026-W35']);
  assert.deepEqual(weeksToRead('2026-W35', '2026-W35'), ['2026-W35']);
});

test('weeksToRead: lùi quá 8 tuần thì không đọc cả năm', () => {
  assert.deepEqual(weeksToRead('2026-W35', '2025-W02'), ['2026-W35']);
});

// --- Rollover: idempotent (yêu cầu số 1) -----------------------------

test('chạy hai lần chỉ ghi nợ MỘT lần', () => {
  const s0 = state({
    currentWeek: '2026-W36',
    lastProcessedWeek: '2026-W35',
    targets: { '2026-W35': wt('2026-W35', 'crunch') },
  });

  const p1 = planRollover(s0);
  assert.equal(p1.reason, 'processed');
  assert.deepEqual(p1.processed, ['2026-W35']);
  // Crunch cắt Learn 31 → 19, ghi nợ 12h. Ngay sau đó target tuần mới trả 50%,
  // nên sổ nợ còn 6h. Đây là số phải KHÔNG đổi khi chạy lần hai.
  assert.equal(p1.creates[0].debtApplied.learn, 6);
  assert.equal(p1.debt?.learn, 6);
  assert.equal(p1.lastProcessedWeek, '2026-W36');

  // Mở lại app ngay sau đó - state đã có cột mốc mới.
  const s1 = applyPlan(s0, p1);
  const p2 = planRollover(s1);

  assert.equal(p2.reason, 'same-week', 'cột mốc chặn lần chạy thứ hai');
  assert.deepEqual(p2.processed, []);
  assert.deepEqual(p2.locks, []);
  assert.deepEqual(p2.creates, []);
  assert.equal(p2.debt, null, 'không ghi đè sổ nợ');
  assert.equal(p2.lastProcessedWeek, null, 'không cần ghi gì');

  // Nợ sau hai lần chạy phải bằng nợ sau một lần chạy.
  const s2 = applyPlan(s1, p2);
  assert.deepEqual(s2.debt, s1.debt);
});

test('chạy mười lần liên tiếp: nợ đứng yên', () => {
  let s = state({
    currentWeek: '2026-W36',
    lastProcessedWeek: '2026-W35',
    targets: { '2026-W35': wt('2026-W35', 'crunch') },
  });
  s = applyPlan(s, planRollover(s));
  const after1: DebtBalance = { ...s.debt };

  for (let i = 0; i < 10; i++) s = applyPlan(s, planRollover(s));
  assert.deepEqual(s.debt, after1);
});

// --- Rollover: các nhánh còn lại -------------------------------------

test('lần đầu dùng app: chỉ đặt cột mốc, KHÔNG ghi nợ', () => {
  const p = planRollover(state({ currentWeek: '2026-W35', lastProcessedWeek: null }));
  assert.equal(p.reason, 'first-run');
  assert.equal(p.debt, null, 'người mới không nợ ai cả');
  assert.deepEqual(p.processed, []);
  assert.deepEqual(p.locks, []);
  assert.equal(p.lastProcessedWeek, '2026-W35');
  assert.equal(p.creates.length, 1, 'vẫn tạo target tuần này');
  assert.equal(p.creates[0].preset, 'normal');
});

test('cùng tuần: không làm gì cả', () => {
  const p = planRollover(
    state({ currentWeek: '2026-W35', lastProcessedWeek: '2026-W35', debt: { learn: 5 } })
  );
  assert.equal(p.reason, 'same-week');
  assert.equal(p.debt, null);
  assert.deepEqual(p.creates, []);
});

test('nghỉ 3 tuần: xử lý đủ 3 tuần, đúng thứ tự', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W33',
      targets: {
        '2026-W33': wt('2026-W33', 'crunch'),
        '2026-W34': wt('2026-W34', 'crunch'),
        '2026-W35': wt('2026-W35', 'crunch'),
      },
    })
  );
  assert.deepEqual(p.processed, ['2026-W33', '2026-W34', '2026-W35'], 'theo thứ tự thời gian');
  assert.deepEqual(p.locks, ['2026-W33', '2026-W34', '2026-W35']);
  // 3 tuần × 12h = 36h nợ. Target tuần mới trả 50% nhưng đụng trần 10h/tuần.
  assert.equal(p.creates[0].debtApplied.learn, 10);
  assert.equal(p.debt?.learn, 26, '36h nợ − 10h trả - không tuần nào bị bỏ');
  assert.equal(p.lastProcessedWeek, '2026-W36');
});

test('tuần không có kế hoạch bị bỏ qua - không nợ từ hư không', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W33',
      targets: { '2026-W34': wt('2026-W34', 'crunch') },
    })
  );
  assert.deepEqual(p.skipped, ['2026-W33', '2026-W35']);
  assert.deepEqual(p.processed, ['2026-W34']);
  // Chỉ W34 sinh nợ: 12h, trừ 6h vừa trả = 6h. Hai tuần trống không góp gì.
  assert.equal(p.debt?.learn, 6, 'chỉ tuần có kế hoạch mới sinh nợ');
});

test('tuần đã khoá không bị khoá lại (rules chặn update khi lockedAt != null)', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W35',
      targets: { '2026-W35': wt('2026-W35', 'crunch', 111) },
    })
  );
  assert.deepEqual(p.locks, [], 'không ghi đè lockedAt');
  assert.deepEqual(p.processed, ['2026-W35'], 'nhưng vẫn ghi nợ của tuần đó');
});

test('preset Normal không sinh nợ', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W35',
      targets: { '2026-W35': wt('2026-W35', 'normal') },
    })
  );
  assert.deepEqual(p.debt, {}, 'đúng baseline thì không nợ gì');
  for (const c of CATEGORIES) assert.equal(PRESETS.normal.weekly[c], BASELINE_WEEKLY[c]);
});

test('bỏ app quá 8 tuần: chỉ đặt lại cột mốc, không dựng lại lịch sử', () => {
  const old = addWeeks('2026-W36', -(MAX_ROLLOVER_WEEKS + 1));
  const p = planRollover(
    state({ currentWeek: '2026-W36', lastProcessedWeek: old, targets: {} })
  );
  assert.equal(p.reason, 'too-far');
  assert.deepEqual(p.processed, []);
  assert.deepEqual(p.locks, []);
  assert.equal(p.lastProcessedWeek, '2026-W36');
});

test('đồng hồ chạy lùi (cột mốc ở tương lai): không ghi nợ âm', () => {
  const p = planRollover(
    state({ currentWeek: '2026-W30', lastProcessedWeek: '2026-W35', targets: {} })
  );
  assert.equal(p.reason, 'too-far');
  assert.deepEqual(p.processed, []);
});

test('target tuần mới đã trừ nợ và vẫn đúng ngân sách', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W35',
      targets: { '2026-W35': wt('2026-W35', 'crunch') },
    })
  );
  const seed = p.creates[0];
  assert.equal(seed.week, '2026-W36');
  assert.equal(total(seed.weekly), TOTAL_BUDGET);
  assert.ok(validateTargets(seed.weekly).ok);
  assert.equal(seed.debtApplied.learn, 6, 'trả 50% của 12h vừa ghi');
  assert.equal(p.debt?.learn, 6, 'còn lại 6h trong sổ');
});

test('tuần hiện tại đã có target: không tạo đè lên', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W35',
      targets: {
        '2026-W35': wt('2026-W35', 'crunch'),
        '2026-W36': wt('2026-W36', 'deep_learn'),
      },
    })
  );
  assert.deepEqual(p.creates, [], 'kế hoạch người dùng tự đặt phải được giữ');
  assert.equal(p.debt?.learn, 12, 'nợ chưa được trả vì không tạo target mới');
});
