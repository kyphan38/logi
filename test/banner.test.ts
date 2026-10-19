import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deviations, expectedHours, logicalWeekday } from '@/lib/balance';
import { loggedRatio, MIN_LOGGED_RATIO, pickBalance } from '@/lib/banner';
import { CATEGORIES, PRESETS, type Activity } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

const WEEKLY = PRESETS.normal.weekly;

// 2026-08-31 is a Monday. The check time is Wednesday 20:41 - the plan's own example.
const MON = '2026-08-31';
const WED_2041 = at('2026-09-02', '20:41');

/** n hours of Work on `date`, starting at 09:00. */
function block(date: string, category: Activity['category'], hours: number): Activity {
  const start = at(date, '09:00');
  return act({ category, startAt: start, endAt: start + hours * H, id: `${date}-${category}` });
}

// --- The easiest thing to get wrong: pro-rating by calendar ------------------------------

test('expectedHours pro-rates BY CALENDAR, not weekly × days/7', () => {
  const byCalendar = expectedHours(WEEKLY, WED_2041);
  const naive = (WEEKLY.work * 3) / 7; // the wrong way: split evenly over 7 days

  assert.ok(
    Math.abs(byCalendar.work - naive) > 3,
    `must differ a lot: calendar ${byCalendar.work.toFixed(1)}h vs even split ${naive.toFixed(1)}h`
  );
  assert.ok(byCalendar.work > naive, 'weekdays carry more Work than the average');
});

// --- Hiding the banner --------------------------------------------------------

test('no target → the banner is hidden', () => {
  assert.equal(pickBalance([], null, WED_2041), null);
});

/**
 * A week exactly on plan up to `now`, then plus/minus in one category.
 * This base is needed because if left empty every category is off and the
 * test would measure an unrelated category.
 */
function onPlan(now: number, tweak: Partial<Record<Activity['category'], number>> = {}) {
  const exp = expectedHours(WEEKLY, now);
  return (['work', 'learn', 'fitness', 'leisure'] as const).map((c) =>
    block(MON, c, Math.max(0, exp[c] + (tweak[c] ?? 0)))
  );
}

test('on plan → hidden entirely, NO "on track"', () => {
  assert.equal(pickBalance(onPlan(WED_2041), WEEKLY, WED_2041), null);
});

test('a small gap inside the deadband → still hidden', () => {
  // Leisure 42 minutes off: over 25% but under 2h → no alert.
  // Without the 2h condition the app nags daily and gets turned off within 3 days.
  const line = pickBalance(onPlan(WED_2041, { leisure: 0.7 }), WEEKLY, WED_2041);
  assert.equal(line, null);
});

// --- Picking exactly one line ----------------------------------------------

test('returns only ONE line, even when several categories are off', () => {
  const acts = onPlan(WED_2041, { work: 12, learn: -9, fitness: -5 });
  const line = pickBalance(acts, WEEKLY, WED_2041);
  assert.ok(line);
  assert.equal(typeof line.text, 'string');
  assert.ok(!line.text.includes('\n'), 'one line, no line breaks');
});

test('takes the deviation with the largest |deltaHours|', () => {
  const acts = onPlan(WED_2041, { work: 4, learn: 11 }); // Learn is further off
  const line = pickBalance(acts, WEEKLY, WED_2041);
  assert.equal(line?.category, 'learn');
  assert.equal(line?.kind, 'over');
});

test('over → over, short → under (no other branch)', () => {
  const over = pickBalance(onPlan(WED_2041, { work: 10 }), WEEKLY, WED_2041);
  assert.equal(over?.kind, 'over');
  assert.equal(over?.category, 'work');
  assert.ok(over!.deltaHours > 0);

  const under = pickBalance(onPlan(WED_2041, { learn: -8 }), WEEKLY, WED_2041);
  assert.equal(under?.kind, 'under');
  assert.equal(under?.category, 'learn');
  assert.ok(under!.deltaHours < 0);
});

test('nothing logged → says there is not enough data, NO -99%', () => {
  // In an empty week every category is -99%. Saying so helps nothing and only
  // discourages. Before Stage 4.6 this returned 'under'/'work'.
  const line = pickBalance([], WEEKLY, WED_2041);
  assert.equal(line?.kind, 'sparse');
  assert.equal(line?.category, null);
  assert.equal(line?.text, 'Not enough logged this week to compare.');
});

test('coverage < 20% → sparse, however big the gap', () => {
  const exp = expectedHours(WEEKLY, WED_2041);
  const total = CATEGORIES.reduce((a, c) => a + exp[c], 0);
  // Log exactly 10% of what should exist.
  const line = pickBalance([block(MON, 'work', total * 0.1)], WEEKLY, WED_2041);
  assert.ok(loggedRatio([block(MON, 'work', total * 0.1)], WEEKLY, WED_2041) < MIN_LOGGED_RATIO);
  assert.equal(line?.kind, 'sparse');
});

test('logged ratio >= 20% → back to normal comparison', () => {
  const exp = expectedHours(WEEKLY, WED_2041);
  const total = CATEGORIES.reduce((a, c) => a + exp[c], 0);
  const acts = [block(MON, 'work', total * 0.5)];
  assert.ok(loggedRatio(acts, WEEKLY, WED_2041) >= MIN_LOGGED_RATIO);
  assert.notEqual(pickBalance(acts, WEEKLY, WED_2041)?.kind, 'sparse');
});

// --- Weekend conflict wins ----------------------------------------

test('the weekend conflict beats every deviation', () => {
  const SUN_2000 = at('2026-09-06', '20:00');
  assert.equal(logicalWeekday(at('2026-09-05', '09:00')), 6, 'must be a Saturday');

  const acts = [
    block('2026-09-05', 'work', 8), // Saturday OT
    block(MON, 'work', 40),
  ];
  const line = pickBalance(acts, WEEKLY, SUN_2000);
  assert.equal(line?.kind, 'conflict');
  assert.equal(line?.category, null);
  assert.ok(line!.text.includes('Learn'), 'must link OT with the Learn shortfall');
});

// --- Wording ----------------------------------------------------------

test('states numbers, does not lecture', () => {
  const line = pickBalance(onPlan(WED_2041, { work: 10 }), WEEKLY, WED_2041);
  assert.match(line!.text, /^Work \d+\.\d+h · \d+\.\d+h expected by now this week \([+-]?\d+%\)$/);
});

test('the expected number does NOT sit next to a / like a weekly target', () => {
  // Old bug: `Work: 0.4h / 31.0h (-99%)` read as if Work's target were 31h,
  // while the Targets screen said 40h.
  const line = pickBalance(onPlan(WED_2041, { work: 10 }), WEEKLY, WED_2041);
  assert.ok(!line!.text.includes('/'), `a slash remains: ${line!.text}`);
  assert.ok(line!.text.includes('expected by now'));
});

// --- The banner matches deviations() called directly -----------------------

test('the banner numbers match deviations() called directly', () => {
  const acts = [
    block(MON, 'work', 14),
    block('2026-09-01', 'work', 12),
    block('2026-09-01', 'learn', 1),
  ];
  const line = pickBalance(acts, WEEKLY, WED_2041);
  const direct = deviations(acts, WEEKLY, WED_2041).filter((d) => d.flag !== 'ok');

  assert.ok(line);
  const worst = direct.reduce((a, b) =>
    Math.abs(b.deltaHours) > Math.abs(a.deltaHours) ? b : a
  );
  assert.equal(line.category, worst.category);
  assert.equal(line.deltaHours, worst.deltaHours);
  assert.ok(line.text.includes(worst.actual.toFixed(1)));
  assert.ok(line.text.includes(worst.expected.toFixed(1)));
});
