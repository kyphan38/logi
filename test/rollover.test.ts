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

// --- Week math -------------------------------------------------------

test('weekStart: lands on Monday, and logicalWeek() maps back to the week name', () => {
  for (const w of ['2026-W01', '2026-W35', '2026-W52', '2027-W01']) {
    const ts = weekStart(w);
    assert.equal(new Date(ts).getDay(), 1, `${w} must be a Monday`);
    assert.equal(logicalWeek(ts), w);
  }
});

test('addWeeks: correct across years', () => {
  assert.equal(addWeeks('2026-W35', 1), '2026-W36');
  assert.equal(addWeeks('2026-W35', -1), '2026-W34');
  assert.equal(addWeeks('2026-W52', 1), '2026-W53');
  assert.equal(weekDiff('2026-W50', addWeeks('2026-W50', 5)), 5);
});

test('weekLockAt: Sunday 21:00, not the Sunday before the week', () => {
  const lock = new Date(weekLockAt('2026-W35'));
  assert.equal(lock.getDay(), 0, 'must be a Sunday');
  assert.equal(lock.getHours(), 21);
  assert.ok(lock.getTime() > weekStart('2026-W35'), 'Sunday must come AFTER Monday');

  assert.equal(isWeekClosed('2026-W35', lock.getTime() - 1), false);
  assert.equal(isWeekClosed('2026-W35', lock.getTime()), true);
});

test('isLateChange: Fri/Sat/Sun are late, Mon–Thu are not', () => {
  assert.equal(isLateChange(at('2026-08-31', '10:00')), false, 'Monday');
  assert.equal(isLateChange(at('2026-09-03', '10:00')), false, 'Thursday');
  assert.equal(isLateChange(at('2026-09-04', '10:00')), true, 'Friday');
  assert.equal(isLateChange(at('2026-09-06', '10:00')), true, 'Sunday');
  // 02:00 Sunday is still Saturday with the 04:00 cutoff → still late.
  assert.equal(isLateChange(at('2026-09-06', '02:00')), true);
});

test('weekLabel: short label for the card', () => {
  assert.equal(weekLabel('2026-W35'), 'W35');
});

// --- Pay debt while keeping the 89h budget ---------------------------

test('settleWithinBudget: pays Learn debt but total stays 89h', () => {
  const out = settleWithinBudget(PRESETS.normal.weekly, { learn: 6 });
  assert.equal(total(out), TOTAL_BUDGET);
  assert.equal(out.learn, 37, 'Learn must get the full 6h of debt');
  assert.ok(validateTargets(out).ok, validateTargets(out).errors.join(' '));
});

test('settleWithinBudget: never cuts below the hard floor', () => {
  const out = settleWithinBudget(PRESETS.normal.weekly, { learn: 10, fitness: 8 });
  assert.ok(out.fitness >= 4.5);
  assert.ok(validateTargets(out).ok, validateTargets(out).errors.join(' '));
});

test('buildWeekly: pays 50% of debt, the rest stays in the ledger', () => {
  const { weekly, applied, remaining } = buildWeekly(PRESETS.normal.weekly, { learn: 12 });
  assert.equal(applied.learn, 6, '50% of 12h');
  assert.equal(remaining.learn, 6);
  assert.equal(total(weekly), TOTAL_BUDGET);
});

test('buildWeekly: huge debt is still capped at 10h', () => {
  const { applied } = buildWeekly(PRESETS.normal.weekly, { learn: 100 });
  assert.equal(applied.learn, 10, '10h/week cap');
});

test('reapplyDebt: switching preset spends no extra debt', () => {
  const first = buildWeekly(PRESETS.normal.weekly, { learn: 12 });
  const switched = reapplyDebt(PRESETS.deep_learn.weekly, first.applied);
  assert.equal(total(switched), TOTAL_BUDGET);
  assert.equal(switched.learn, PRESETS.deep_learn.weekly.learn + 6, 'still exactly the 6h paid');
});

test('roundToBudget: floating point error does not break validateTargets', () => {
  const messy: Weekly = { work: 43.333333, learn: 31.333333, fitness: 8.966667, leisure: 5.7 };
  const out = roundToBudget(messy);
  assert.equal(total(out), TOTAL_BUDGET);
  assert.ok(validateTargets(out).ok);
});

// --- weeksToRead: read before write (Firestore transaction rule) ------

test('weeksToRead: includes the current week and every unprocessed week', () => {
  const got = weeksToRead('2026-W35', '2026-W32');
  assert.deepEqual([...got].sort(), ['2026-W32', '2026-W33', '2026-W34', '2026-W35']);
});

test('weeksToRead: first run only needs the current week', () => {
  assert.deepEqual(weeksToRead('2026-W35', null), ['2026-W35']);
  assert.deepEqual(weeksToRead('2026-W35', '2026-W35'), ['2026-W35']);
});

test('weeksToRead: more than 8 weeks back does not read the whole year', () => {
  assert.deepEqual(weeksToRead('2026-W35', '2025-W02'), ['2026-W35']);
});

// --- Rollover: idempotent (requirement 1) -----------------------------

test('running twice records debt only ONCE', () => {
  const s0 = state({
    currentWeek: '2026-W36',
    lastProcessedWeek: '2026-W35',
    targets: { '2026-W35': wt('2026-W35', 'crunch') },
  });

  const p1 = planRollover(s0);
  assert.equal(p1.reason, 'processed');
  assert.deepEqual(p1.processed, ['2026-W35']);
  // Crunch cuts Learn 31 → 19, recording 12h debt. The new week's target pays back 50%,
  // so 6h is left. This number must NOT change on the second run.
  assert.equal(p1.creates[0].debtApplied.learn, 6);
  assert.equal(p1.debt?.learn, 6);
  assert.equal(p1.lastProcessedWeek, '2026-W36');

  // Reopen the app right after - state already has the new marker.
  const s1 = applyPlan(s0, p1);
  const p2 = planRollover(s1);

  assert.equal(p2.reason, 'same-week', 'the marker blocks the second run');
  assert.deepEqual(p2.processed, []);
  assert.deepEqual(p2.locks, []);
  assert.deepEqual(p2.creates, []);
  assert.equal(p2.debt, null, 'debt is not overwritten');
  assert.equal(p2.lastProcessedWeek, null, 'nothing to write');

  // Debt after two runs must equal debt after one run.
  const s2 = applyPlan(s1, p2);
  assert.deepEqual(s2.debt, s1.debt);
});

test('ten runs in a row: debt stays put', () => {
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

// --- Rollover: other branches -------------------------------------

test('first use: only sets the marker, records NO debt', () => {
  const p = planRollover(state({ currentWeek: '2026-W35', lastProcessedWeek: null }));
  assert.equal(p.reason, 'first-run');
  assert.equal(p.debt, null, 'a new user owes nothing');
  assert.deepEqual(p.processed, []);
  assert.deepEqual(p.locks, []);
  assert.equal(p.lastProcessedWeek, '2026-W35');
  assert.equal(p.creates.length, 1, 'still creates the target for this week');
  assert.equal(p.creates[0].preset, 'normal');
});

test('same week: does nothing', () => {
  const p = planRollover(
    state({ currentWeek: '2026-W35', lastProcessedWeek: '2026-W35', debt: { learn: 5 } })
  );
  assert.equal(p.reason, 'same-week');
  assert.equal(p.debt, null);
  assert.deepEqual(p.creates, []);
});

test('3 weeks away: processes all 3 weeks, in order', () => {
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
  assert.deepEqual(p.processed, ['2026-W33', '2026-W34', '2026-W35'], 'in time order');
  assert.deepEqual(p.locks, ['2026-W33', '2026-W34', '2026-W35']);
  // 3 weeks × 12h = 36h debt. The new week's target pays 50% but hits the 10h/week cap.
  assert.equal(p.creates[0].debtApplied.learn, 10);
  assert.equal(p.debt?.learn, 26, '36h debt − 10h paid - no week is skipped');
  assert.equal(p.lastProcessedWeek, '2026-W36');
});

test('weeks with no plan are skipped - no debt from nothing', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W33',
      targets: { '2026-W34': wt('2026-W34', 'crunch') },
    })
  );
  assert.deepEqual(p.skipped, ['2026-W33', '2026-W35']);
  assert.deepEqual(p.processed, ['2026-W34']);
  // Only W34 creates debt: 12h, minus 6h just paid = 6h. The two empty weeks add nothing.
  assert.equal(p.debt?.learn, 6, 'only weeks with a plan create debt');
});

test('a locked week is not locked again (rules block update when lockedAt != null)', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W35',
      targets: { '2026-W35': wt('2026-W35', 'crunch', 111) },
    })
  );
  assert.deepEqual(p.locks, [], 'lockedAt is not overwritten');
  assert.deepEqual(p.processed, ['2026-W35'], 'but the debt for that week is still recorded');
});

test('Normal preset creates no debt', () => {
  const p = planRollover(
    state({
      currentWeek: '2026-W36',
      lastProcessedWeek: '2026-W35',
      targets: { '2026-W35': wt('2026-W35', 'normal') },
    })
  );
  assert.deepEqual(p.debt, {}, 'at baseline there is no debt');
  for (const c of CATEGORIES) assert.equal(PRESETS.normal.weekly[c], BASELINE_WEEKLY[c]);
});

test('away more than 8 weeks: only reset the marker, do not rebuild history', () => {
  const old = addWeeks('2026-W36', -(MAX_ROLLOVER_WEEKS + 1));
  const p = planRollover(
    state({ currentWeek: '2026-W36', lastProcessedWeek: old, targets: {} })
  );
  assert.equal(p.reason, 'too-far');
  assert.deepEqual(p.processed, []);
  assert.deepEqual(p.locks, []);
  assert.equal(p.lastProcessedWeek, '2026-W36');
});

test('clock goes backwards (marker in the future): no negative debt', () => {
  const p = planRollover(
    state({ currentWeek: '2026-W30', lastProcessedWeek: '2026-W35', targets: {} })
  );
  assert.equal(p.reason, 'too-far');
  assert.deepEqual(p.processed, []);
});

test('the target for the new week already subtracts debt and stays within budget', () => {
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
  assert.equal(seed.debtApplied.learn, 6, 'pays 50% of the 12h just recorded');
  assert.equal(p.debt?.learn, 6, '6h left in the ledger');
});

test('current week already has a target: do not overwrite it', () => {
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
  assert.deepEqual(p.creates, [], 'a plan the user set must be kept');
  assert.equal(p.debt?.learn, 12, 'debt is not paid since no new target is created');
});
