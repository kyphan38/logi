import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  logicalDate,
  logicalWeekday,
  logicalWeek,
  overlapHours,
  findStale,
  suggestedEndTimes,
  validateTargets,
  rebalance,
  accrueDebt,
  applyDebt,
} from '@/lib/balance';
import { BASELINE_WEEKLY, TOTAL_BUDGET, CATEGORIES } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

// --- The 04:00 day cut (items 9, 10 in the manual checklist) --------------

test('logicalDate: before 04:00 is still the previous day', () => {
  assert.equal(logicalDate(at('2026-08-27', '03:59')), '2026-08-26');
  assert.equal(logicalDate(at('2026-08-27', '00:30')), '2026-08-26');
});

test('logicalDate: from 04:00 it is a new day', () => {
  assert.equal(logicalDate(at('2026-08-27', '04:00')), '2026-08-27');
  assert.equal(logicalDate(at('2026-08-27', '22:00')), '2026-08-27');
});

test('logicalDate: 04:00 steps back across the start of a month', () => {
  assert.equal(logicalDate(at('2026-09-01', '02:00')), '2026-08-31');
});

test('logicalWeekday: 2026-08-26 is a Wednesday = 3', () => {
  assert.equal(logicalWeekday(at('2026-08-26', '12:00')), 3);
  // 02:00 Thursday still belongs to Wednesday's logical day
  assert.equal(logicalWeekday(at('2026-08-27', '02:00')), 3);
});

test('logicalWeek follows the ISO week of the logical day', () => {
  assert.equal(logicalWeek(at('2026-08-26', '12:00')), '2026-W35');
  assert.equal(logicalWeek(at('2026-08-27', '02:00')), '2026-W35');
});

// --- Overlap (items 3, 13) --------------------------------------------

test('overlapHours: two parallel sessions of 1 hour', () => {
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({
    id: 'b',
    category: 'learn',
    startAt: at('2026-08-26', '10:00'),
    endAt: at('2026-08-26', '12:00'),
  });
  assert.equal(overlapHours([a, b]), 1);
});

test('overlapHours: no overlap gives 0', () => {
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '10:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '11:00') });
  assert.equal(overlapHours([a, b]), 0);
});

test('overlapHours: ignores abandoned records', () => {
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({
    id: 'b',
    startAt: at('2026-08-26', '09:30'),
    endAt: at('2026-08-26', '10:30'),
    status: 'abandoned',
  });
  assert.equal(overlapHours([a, b]), 0);
});

test('overlapHours: a running session counts up to now', () => {
  const now = at('2026-08-26', '11:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: null });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: null });
  assert.equal(overlapHours([a, b], now), 1);
});

// --- Stale sessions (item 14 - cannot be tested by hand) ------------------

test('findStale: active over 15h is stale', () => {
  const now = at('2026-08-27', '02:00');
  const stale = act({ startAt: now - 16 * H, endAt: null });
  assert.deepEqual(findStale([stale], now).map((a) => a.id), [stale.id]);
});

test('findStale: active under 15h is not stale yet', () => {
  const now = at('2026-08-26', '12:00');
  const fresh = act({ startAt: now - 14.9 * H, endAt: null });
  assert.equal(findStale([fresh], now).length, 0);
});

test('findStale: a done record is never stale', () => {
  const now = at('2026-08-27', '12:00');
  const old = act({ startAt: now - 30 * H, endAt: now - 20 * H });
  assert.equal(findStale([old], now).length, 0);
});

test('suggestedEndTimes only suggests times after the start', () => {
  const a = act({ category: 'work', startAt: at('2026-08-26', '18:00') });
  const s = suggestedEndTimes(a);
  assert.ok(s.length > 0);
  for (const x of s) assert.ok(x.ts > a.startAt, `${x.label} must be after startAt`);
});

// --- Weekly budget --------------------------------------------------

test('validateTargets: the baseline is valid', () => {
  const r = validateTargets(BASELINE_WEEKLY);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.total, TOTAL_BUDGET);
});

test('validateTargets: over budget reports an error', () => {
  const bad = { ...BASELINE_WEEKLY, work: BASELINE_WEEKLY.work + 20 };
  assert.equal(validateTargets(bad).ok, false);
});

test('rebalance: raising work keeps the total = TOTAL_BUDGET', () => {
  const next = rebalance(BASELINE_WEEKLY, 'work', BASELINE_WEEKLY.work + 8);
  const total = CATEGORIES.reduce((s, c) => s + next[c], 0);
  assert.ok(Math.abs(total - TOTAL_BUDGET) < 0.11, `total = ${total}`);
  // The extra 8h for Work is spread evenly over the other 3 categories, none skipped.
  for (const c of CATEGORIES) {
    if (c === 'work') continue;
    assert.ok(next[c] < BASELINE_WEEKLY[c], `${c} must go down`);
  }
});

test('applyDebt never pays more than the debt', () => {
  const cut = { ...BASELINE_WEEKLY, work: BASELINE_WEEKLY.work - 5 };
  const debt = accrueDebt(cut, {});
  assert.ok(Math.abs((debt.work ?? 0) - 5) < 1e-9, 'cutting 5h of work → 5h debt');
  const { applied, remaining } = applyDebt(BASELINE_WEEKLY, debt);
  for (const c of CATEGORIES) {
    const owed = debt[c] ?? 0;
    if (owed <= 0) continue;
    assert.ok((applied[c] ?? 0) <= owed + 1e-9);
    assert.ok(Math.abs((applied[c] ?? 0) + (remaining[c] ?? 0) - owed) < 1e-9);
  }
});
