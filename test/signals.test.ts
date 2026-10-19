import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expectedForRange } from '@/lib/range-target';
import type { Range } from '@/lib/range';
import {
  computeSignals,
  previousRange,
  type PreviousPeriod,
  type Signals,
} from '@/lib/signals';
import { PRESETS, type Activity, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

// Week 2026-W35: Monday 24/08 → Sunday 30/08. Scored on 31/08 so
// no day is unfinished - expected numbers can be worked out by hand.
const MON = '2026-08-24';
const TUE = '2026-08-25';
const WED = '2026-08-26';
const THU = '2026-08-27';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30';
const NOW = at('2026-08-31', '12:00');

const WEEK: Range = { from: MON, to: SUN, kind: 'custom', isPartial: false };

const targets = new Map<string, Record<Category, number>>([
  ['2026-W34', PRESETS.normal.weekly],
  ['2026-W35', PRESETS.normal.weekly],
]);

function sig(activities: Activity[], previous?: PreviousPeriod, range: Range = WEEK): Signals {
  return computeSignals(
    activities,
    range,
    expectedForRange(range, targets, NOW),
    targets,
    previous,
    NOW
  );
}

/** Test helper: a finished session from one time to another. */
function s(
  category: Category,
  date: string,
  from: string,
  to: string,
  endDate = date
): Activity {
  return act({
    id: `${category}-${date}-${from}`,
    category,
    startAt: at(date, from),
    endAt: at(endDate, to),
  });
}

const near = (a: number | null, b: number, msg?: string) =>
  assert.ok(a !== null && Math.abs(a - b) < 0.001, `${msg ?? ''} ${a} ≠ ${b}`);

// ------------------------------------------------------------
// Group A - general
// ------------------------------------------------------------

test('A: session count, median and longest block per category', () => {
  const g = sig([
    s('learn', MON, '05:00', '05:20'),
    s('learn', TUE, '20:00', '21:00'),
    s('learn', WED, '20:00', '21:40'),
  ]);
  const learn = g.byCategory.learn;
  assert.equal(learn.sessions, 3);
  assert.equal(learn.medianSessionMin, 60);
  assert.equal(learn.longestBlockMin, 100);
  near(learn.actual, 20 / 60 + 1 + 100 / 60);
});

test('A: zeroDays counts only lived days, deviationPct is vs target', () => {
  const g = sig([s('learn', MON, '05:00', '07:00'), s('learn', TUE, '05:00', '07:00')]);
  assert.equal(g.dayCount, 7);
  assert.equal(g.elapsedDays, 7);
  assert.equal(g.byCategory.learn.zeroDays, 5);
  assert.equal(g.byCategory.fitness.zeroDays, 7);
  // Normal: Learn 31h/week. Log 4h → deviation (4 − 31)/31.
  near(g.byCategory.learn.deviationPct!, (4 - 31) / 31);
});

test('A: no previous period gives null deltaVsPrevious, otherwise the difference', () => {
  const none = sig([s('work', MON, '08:00', '12:00')]);
  assert.equal(none.byCategory.work.deltaVsPrevious, null);
  assert.equal(none.hasPrevious, false);

  const prev = previousRange(WEEK);
  assert.equal(prev.from, '2026-08-17');
  assert.equal(prev.to, '2026-08-23');

  const g = sig([s('work', MON, '08:00', '12:00')], {
    activities: [s('work', '2026-08-18', '08:00', '18:00')],
    expected: expectedForRange(prev, targets, NOW),
  });
  near(g.byCategory.work.deltaVsPrevious!, 4 - 10);
});

// ------------------------------------------------------------
// Group B - Day rhythm (replaces Sleep, AMENDMENT-remove-sleep section 10)
// ------------------------------------------------------------

test('B: lastActivityMedian uses the latest end time of each day', () => {
  const g = sig([
    s('work', MON, '08:00', '17:00'),
    s('learn', MON, '20:00', '21:00'), // MON ends 21:00
    s('learn', TUE, '20:00', '22:00'), // TUE ends 22:00
    s('leisure', WED, '20:00', '23:30'), // WED ends 23:30
  ]);
  assert.equal(g.night.daysWithActivity, 3);
  // 1260, 1320, 1410 → median 1320 = 22:00
  assert.equal(g.night.lastActivityMedian, 22 * 60);
  assert.equal(g.night.lastActivitySpreadMin, 1410 - 1260);
});

test('B: activity past midnight sits on the logical-day axis, in its start day', () => {
  const g = sig([
    s('learn', MON, '05:00', '06:00'),
    s('leisure', MON, '22:00', '01:00', TUE),
  ]);
  // Both on logical day MON: session 22:00 → 01:00 goes fully to MON.
  assert.equal(g.night.daysWithActivity, 1);
  // 01:00 on the logical-day axis is 25:00 = 1500, not 60.
  assert.equal(g.night.lastActivityMedian, 25 * 60);
  assert.equal(g.night.lateNightActivityDays, 1);
  // One day has no spread.
  assert.equal(g.night.lastActivitySpreadMin, null);
});

test('B: lateNightActivityDays counts days, not sessions', () => {
  const g = sig([
    s('leisure', MON, '23:10', '23:50'),
    s('work', MON, '21:00', '23:30'), // same day → still counts as 1
    s('learn', TUE, '20:00', '22:00'), // stops before 23:00 → not counted
    s('work', WED, '22:00', '00:30', THU),
  ]);
  assert.equal(g.night.lateNightActivityDays, 2);
});

test('B: earlyStartDays counts days starting before 06:00', () => {
  const g = sig([
    s('learn', MON, '04:30', '06:30'),
    s('learn', TUE, '05:59', '07:00'),
    s('learn', WED, '06:00', '07:00'), // exactly on the mark → not counted
    s('work', THU, '08:00', '17:00'),
  ]);
  assert.equal(g.night.earlyStartDays, 2);
});

test('B: with no logs every day-rhythm metric is 0 or null', () => {
  const g = sig([]);
  assert.equal(g.night.daysWithActivity, 0);
  assert.equal(g.night.lateNightActivityDays, 0);
  assert.equal(g.night.earlyStartDays, 0);
  assert.equal(g.night.lastActivityMedian, null);
  assert.equal(g.night.lastActivitySpreadMin, null);
});

// ------------------------------------------------------------
// Group C - Work
// ------------------------------------------------------------

test('C: otHours counts only time outside 08:00–17:00 on Monday–Friday', () => {
  const g = sig([
    s('work', MON, '07:00', '19:00'), // 3h outside the window
    s('work', SAT, '09:00', '12:00'), // weekend, not in otHours
  ]);
  near(g.work.otHours, 3);
  near(g.work.weekendWorkHours, 3);
  assert.equal(g.work.officeDaysLogged, 1);
});

test('C: lateWorkHours counts from 20:00, including time past midnight', () => {
  const g = sig([
    s('work', TUE, '18:00', '21:30'),
    s('work', THU, '19:00', '00:30', FRI),
  ]);
  // Thu: 20:00–24:00 = 4h, plus 00:00–00:30 of Fri = 0.5h.
  near(g.work.lateWorkHours, 1.5 + 4.5);
  assert.equal(g.work.officeDaysLogged, 0);
});

test('C: longest Work day and number of days over 10h', () => {
  const g = sig([
    s('work', MON, '08:00', '19:00'), // 11h
    s('work', TUE, '08:00', '17:00'), // 9h
  ]);
  assert.equal(g.work.longestWorkDay!.date, MON);
  near(g.work.longestWorkDay!.hours, 11);
  assert.equal(g.work.daysOver10hWork, 1);
  // Ends at 19:00 and 17:00 → spread of 120 minutes.
  assert.equal(g.work.workEndSpreadMin, 120);
});

// ------------------------------------------------------------
// Group D - Learn
// ------------------------------------------------------------

test('D: morning and evening blocks are split', () => {
  const g = sig([
    s('learn', TUE, '05:00', '06:30'),
    s('learn', TUE, '20:30', '22:00'),
    s('learn', WED, '09:00', '10:00'), // in neither block
  ]);
  assert.equal(g.learn.morningLearnDays, 1);
  near(g.learn.morningLearnHours, 1.5);
  assert.equal(g.learn.eveningLearnDays, 1);
  near(g.learn.eveningLearnHours, 1.5);
  assert.equal(g.learn.longestLearnBlockMin, 90);
});

test('D: weekend learn hours and the Normal preset weekend target', () => {
  const g = sig([s('learn', SAT, '08:00', '12:00'), s('learn', MON, '05:00', '06:00')]);
  near(g.learn.weekendLearnHours, 4);
  near(g.learn.weekendLearnTarget, 16);
  assert.equal(g.learn.daysWithZeroLearn, 5);
});

test('D: learnStreak breaks on a day under 50% of the target for that day', () => {
  // Normal target: weekdays 3h (mark 1.5h), weekend 8h (mark 4h).
  const g = sig([
    s('learn', THU, '20:00', '21:00'), // 1h < 1.5h → breaks here
    s('learn', FRI, '20:00', '22:00'), // 2h ✓
    s('learn', SAT, '08:00', '12:00'), // 4h ✓
    s('learn', SUN, '08:00', '12:00'), // 4h ✓
  ]);
  assert.equal(g.learn.learnStreak, 3);
});

test('D: worst weekday for Learn shows only when the range covers 7 days', () => {
  const short: Range = { from: MON, to: WED, kind: 'custom', isPartial: false };
  assert.equal(sig([], undefined, short).learn.weekdayWorstForLearn, null);

  const g = sig([
    s('learn', MON, '05:00', '07:00'),
    s('learn', TUE, '05:00', '07:00'),
    s('learn', THU, '05:00', '07:00'),
    s('learn', FRI, '05:00', '07:00'),
    s('learn', SAT, '05:00', '07:00'),
    s('learn', SUN, '05:00', '07:00'),
  ]);
  // Only Wednesday has no learning → Wednesday is 3.
  assert.equal(g.learn.weekdayWorstForLearn!.weekday, 3);
  near(g.learn.weekdayWorstForLearn!.hours, 0);
});

// ------------------------------------------------------------
// Group E - Fitness
// ------------------------------------------------------------

test('E: longestGapDays is the number of days between two sessions', () => {
  const g = sig([
    s('fitness', MON, '18:00', '19:00'),
    s('fitness', WED, '18:00', '19:00'),
    s('fitness', SUN, '18:00', '19:00'),
  ]);
  assert.equal(g.fitness.sessions, 3);
  // 26/08 → 30/08 is four days.
  assert.equal(g.fitness.longestGapDays, 4);
  assert.equal(g.fitness.daysSinceLast, 1);
  near(g.fitness.sessionsPerWeek, 3);
  assert.equal(g.fitness.medianSessionMin, 60);
  assert.deepEqual(g.fitness.weekdayDistribution, [1, 1, 0, 1, 0, 0, 0]);
});

test('E: skippedAfterWorkDays counts only Work days > 9h with no workout', () => {
  const g = sig([
    s('work', MON, '08:00', '19:00'), // 11h, no workout
    s('work', TUE, '08:00', '19:00'), // 11h, with workout
    s('fitness', TUE, '19:30', '20:30'),
    s('work', WED, '08:00', '16:00'), // 8h, no workout → not counted
  ]);
  assert.equal(g.fitness.skippedAfterWorkDays, 1);
});

test('E: no workouts yet means no made-up gap', () => {
  const g = sig([s('work', MON, '08:00', '17:00')]);
  assert.equal(g.fitness.longestGapDays, null);
  assert.equal(g.fitness.daysSinceLast, null);
  assert.equal(g.fitness.medianSessionMin, null);
});

// ------------------------------------------------------------
// Group F - Leisure
// ------------------------------------------------------------

test('F: lateLeisureHours counts from 22:00, including time past midnight', () => {
  const g = sig([
    s('leisure', MON, '21:00', '23:30'),
    s('leisure', TUE, '23:00', '01:00', WED),
  ]);
  near(g.leisure.lateLeisureHours, 1.5 + 2);
  near(g.leisure.hours, 2.5 + 2);
  assert.equal(g.leisure.longestBlockMin, 150);
});

test('F: weekday and weekend leisure hours are split', () => {
  const g = sig([s('leisure', TUE, '20:00', '21:00'), s('leisure', SAT, '14:00', '17:00')]);
  near(g.leisure.weekdayLeisureHours, 1);
  near(g.leisure.weekendLeisureHours, 3);
});

// ------------------------------------------------------------
// Group G - cross links
// ------------------------------------------------------------

test('G: under 3 samples returns null, no guessing', () => {
  const g = sig([
    s('work', MON, '08:00', '18:30'), // 10.5h
    s('work', TUE, '08:00', '18:30'),
    s('learn', MON, '20:00', '21:00'),
  ]);
  assert.equal(g.links.learnOnHighWorkDays, null);
});

test('G: 3 samples gives a value with sampleSize', () => {
  const g = sig([
    s('work', MON, '08:00', '18:30'),
    s('work', TUE, '08:00', '18:30'),
    s('work', WED, '08:00', '18:30'),
    s('learn', MON, '20:00', '21:00'), // 1h
    s('learn', TUE, '20:00', '20:30'), // 0.5h
    s('learn', THU, '20:00', '22:00'), // normal Work day
  ]);
  assert.equal(g.links.learnOnHighWorkDays!.sampleSize, 3);
  near(g.links.learnOnHighWorkDays!.value, 0.5);
  assert.equal(g.links.learnOnNormalDays!.sampleSize, 4);
});

test('G: only the day AFTER a day active past 23:00 counts', () => {
  const g = sig([
    s('leisure', MON, '22:00', '23:30'),
    s('leisure', TUE, '22:00', '23:30'),
    s('leisure', WED, '22:00', '23:30'),
    s('learn', TUE, '05:00', '06:00'), // 1h
    s('learn', THU, '05:00', '07:00'), // 2h
  ]);
  assert.equal(g.night.lateNightActivityDays, 3);
  assert.equal(g.links.learnAfterLateNights!.sampleSize, 3);
  // Days after three late nights: Tue 1h, Wed 0h, Thu 2h → average 1h.
  near(g.links.learnAfterLateNights!.value, 1);
});

test('G: under 3 late nights gives null learnAfterLateNights', () => {
  const g = sig([
    s('leisure', MON, '22:00', '23:30'),
    s('leisure', TUE, '22:00', '23:30'),
    s('learn', TUE, '05:00', '06:00'),
  ]);
  assert.equal(g.links.learnAfterLateNights, null);
});

test('G: displacedBy matches the change vs the previous period', () => {
  const prev = previousRange(WEEK);
  const g = sig([s('learn', MON, '08:00', '13:00'), s('work', TUE, '08:00', '10:00')], {
    activities: [
      s('learn', '2026-08-17', '08:00', '09:00'),
      s('work', '2026-08-18', '08:00', '16:00'),
    ],
    expected: expectedForRange(prev, targets, NOW),
  });
  const d = g.links.displacedBy!;
  assert.equal(d.up, 'learn');
  near(d.upHours, 4);
  assert.equal(d.down, 'work');
  near(d.downHours, -6);
  assert.equal(d.sampleSize, 7);
});

test('G: a week has only 2 weekend days → paired metrics are hidden', () => {
  const g = sig([s('learn', SAT, '08:00', '12:00')]);
  assert.equal(g.links.weekendLearnVsWeekendWork, null);
  // But weekend total hours (group D) stay, since they are not a guess.
  near(g.learn.weekendLearnHours, 4);
});
