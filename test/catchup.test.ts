import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DAY_CAP, catchUp, dayCap, dowAt, isWeekend, weekPos } from '@/lib/catchup';
import { dailyTargetFor } from '@/lib/day-target';
import { BASELINE_DAILY, CATEGORIES, PRESETS, type Category } from '@/types/logi';

const zero = (): Record<Category, number> =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

const W = PRESETS.normal.weekly;

// dow: 0 = CN … 6 = T7
const [SUN, MON, TUE, WED, THU, FRI, SAT] = [0, 1, 2, 3, 4, 5, 6];

// --- position in the week -------------------------------------------------------

test('weekPos: the week runs Mon → Sun, not Sun → Sat', () => {
  assert.equal(weekPos(MON), 0);
  assert.equal(weekPos(SAT), 5);
  assert.equal(weekPos(SUN), 6, 'Sunday is the last day, not the first');
});

test('dowAt is the inverse of weekPos', () => {
  for (let dow = 0; dow < 7; dow++) assert.equal(dowAt(weekPos(dow)), dow);
});

test('isWeekend is only true for Sat and Sun', () => {
  assert.deepEqual(
    [SUN, MON, TUE, WED, THU, FRI, SAT].map(isWeekend),
    [true, false, false, false, false, false, true]
  );
});

test('dayCap: the weekend Learn cap is above the weekend standard (8h)', () => {
  assert.ok(dayCap('learn', SAT) > BASELINE_DAILY.learn[SAT], 'a cap below the standard makes no sense');
  assert.ok(dayCap('learn', SUN) > BASELINE_DAILY.learn[SUN]);
});

test('dayCap: the weekday Work cap is still above 9.5h (8h + 1.5h commute)', () => {
  assert.ok(dayCap('work', TUE) >= BASELINE_DAILY.work[TUE], 'Tue/Thu are office days');
});

// --- on plan, the plan does not drift -----------------------------------

test('doing the suggestion each day → the next day gives the number planned from the start', () => {
  // A clean start on Monday, no debt and no surplus.
  const first = catchUp(W, zero(), MON);
  const plannedTue = catchUp(W, { ...zero(), learn: first.learn.suggested }, TUE);

  // Monday matches the suggestion → Tuesday must equal a clean week's suggestion.
  const cleanTue = catchUp(W, zero(), MON); // for the shape
  assert.ok(cleanTue.learn.suggested > 0);
  assert.equal(
    +plannedTue.learn.suggested.toFixed(1),
    +dailyTargetFor(TUE, W).learn.toFixed(1),
    'on plan, the suggestion must equal the standard'
  );
});

test('a clean week from Monday → the suggestion equals the standard in every category', () => {
  const p = catchUp(W, zero(), MON);
  for (const c of CATEGORIES) {
    assert.equal(+p[c].suggested.toFixed(1), +p[c].standard.toFixed(1), c);
  }
});

test('on plan until mid-week → the suggestion is still the standard', () => {
  // Log exactly the standard for Mon, Tue, Wed, then ask on Thursday.
  const before = zero();
  for (const dow of [MON, TUE, WED]) {
    const d = dailyTargetFor(dow, W);
    for (const c of CATEGORIES) before[c] += d[c];
  }
  const p = catchUp(W, before, THU);
  for (const c of CATEGORIES) {
    assert.equal(+p[c].suggested.toFixed(1), +p[c].standard.toFixed(1), c);
  }
});

// --- catching up and easing off --------------------------------------------------------------

test('extra study on Monday → Tuesday suggests less than the standard', () => {
  const p = catchUp(W, { ...zero(), learn: 10 }, TUE);
  assert.ok(p.learn.suggested < p.learn.standard, `${p.learn.suggested} must be < ${p.learn.standard}`);
  assert.equal(p.learn.remaining, +(W.learn - 10).toFixed(1));
});

test('an empty start of week → the suggestion is above the standard', () => {
  const p = catchUp(W, zero(), THU); // nothing logged Mon, Tue, Wed
  assert.ok(p.learn.suggested > p.learn.standard, 'owing 3 days but still asking 3h cannot catch up');
});

test('the remaining suggestions add up to what is owed, if no cap is hit', () => {
  const before = { ...zero(), learn: 5 };
  let sum = 0;
  let done = { ...before };
  for (let pos = weekPos(WED); pos <= 6; pos++) {
    const p = catchUp(W, done, dowAt(pos));
    sum += p.learn.suggested;
    done = { ...done, learn: done.learn + p.learn.suggested };
  }
  assert.ok(Math.abs(sum - (W.learn - 5)) < 0.15, `sum ${sum} vs owed ${W.learn - 5}`);
});

// --- done is done -------------------------------------------------------

test('weekly target met → met, suggestion 0, nothing more asked', () => {
  const p = catchUp(W, { ...zero(), learn: W.learn }, WED);
  assert.equal(p.learn.met, true);
  assert.equal(p.learn.suggested, 0);
});

test('over the weekly target → still met, no negative number', () => {
  const p = catchUp(W, { ...zero(), learn: W.learn + 20 }, WED);
  assert.equal(p.learn.met, true);
  assert.equal(p.learn.remaining, 0);
  assert.equal(p.learn.suggested, 0);
});

test('a weekly target of 0 → not "met", just nothing to do', () => {
  const weekly = { ...W, fitness: 0 };
  const p = catchUp(weekly, zero(), WED);
  assert.equal(p.fitness.met, false, 'marking something done that never existed is a lie');
  assert.equal(p.fitness.suggested, 0);
});

// --- the category's day off --------------------------------------------------

test('Fitness on Sunday is a day off → no debt is ever pushed there', () => {
  assert.equal(BASELINE_DAILY.fitness[SUN], 0, 'test assumption');
  const p = catchUp(W, zero(), SUN); // owing all 9h of fitness
  assert.equal(p.fitness.suggested, 0);
});

test('Work on weekends is a day off → never suggests make-up work', () => {
  assert.equal(BASELINE_DAILY.work[SAT], 0, 'test assumption');
  const p = catchUp(W, zero(), SAT);
  assert.equal(p.work.suggested, 0, 'owing 43h of Work is no reason to work on Saturday');
});

test('Learn piles onto the weekend when only Sat and Sun remain', () => {
  const before = { ...zero(), learn: 5 };
  const sat = catchUp(W, before, SAT);
  const shape = BASELINE_DAILY.learn;
  const want = (W.learn - 5) * (shape[SAT] / (shape[SAT] + shape[SUN]));
  assert.equal(+sat.learn.suggested.toFixed(1), +Math.min(want, dayCap('learn', SAT)).toFixed(1));
});

// --- the cap --------------------------------------------------------------------

test('lots of debt with few days left → hits the cap, never says study 20h', () => {
  const p = catchUp(W, zero(), FRI); // owing almost a week of Learn, with Fri/Sat/Sun left
  const cap = dayCap('learn', FRI);
  assert.ok(p.learn.suggested <= cap + 1e-9, `${p.learn.suggested} is over the cap ${cap}`);
});

test('hitting the cap sets capped, otherwise not', () => {
  const hard = catchUp(W, zero(), SUN); // everything piled onto Sunday
  assert.equal(hard.learn.capped, true);
  assert.equal(hard.learn.suggested, DAY_CAP.learn.weekend);

  const easy = catchUp(W, zero(), MON);
  assert.equal(easy.learn.capped, false, 'a clean week has no reason to hit the cap');
});

test('a high weekly target → the cap yields to the standard, an on-plan week still reaches the target', () => {
  // Learn 49h/week: Saturday's standard is 12.6h, above the 10h hard cap.
  const weekly = { ...W, learn: 49 };
  const std = dailyTargetFor(SAT, weekly).learn;
  assert.ok(std > DAY_CAP.learn.weekend, 'test assumption');

  // On plan EXACTLY through Friday, then ask on Saturday - no debt at all.
  const onPlan = zero();
  for (const dow of [MON, TUE, WED, THU, FRI]) {
    for (const c of CATEGORIES) onPlan[c] += dailyTargetFor(dow, weekly)[c];
  }
  const p = catchUp(weekly, onPlan, SAT);
  assert.equal(p.learn.capped, false, 'the cap must not overrule the plan itself');
  assert.equal(+p.learn.suggested.toFixed(1), +std.toFixed(1));

  // Following the suggestion all week must log the full 49h, not fall short because of the cap.
  let done = zero();
  let sum = 0;
  for (let pos = 0; pos <= 6; pos++) {
    const day = catchUp(weekly, done, dowAt(pos)).learn;
    assert.equal(day.capped, false, `day ${pos} reports the cap despite being on plan`);
    sum += day.suggested;
    done = { ...done, learn: done.learn + day.suggested };
  }
  assert.ok(Math.abs(sum - 49) < 0.15, `on plan but only ${sum}/49`);
});

test('every case: the suggestion never exceeds the cap and is never negative', () => {
  for (const preset of Object.values(PRESETS)) {
    for (let dow = 0; dow < 7; dow++) {
      for (const doneRatio of [0, 0.25, 0.5, 1, 2]) {
        const before = Object.fromEntries(
          CATEGORIES.map((c) => [c, preset.weekly[c] * doneRatio])
        ) as Record<Category, number>;
        const p = catchUp(preset.weekly, before, dow);
        for (const c of CATEGORIES) {
          assert.ok(p[c].suggested >= 0, `${c} is negative`);
          // The cap yields to the standard, and `suggested` rounds to 0.1, so the cap must round too.
          const std = Math.round(dailyTargetFor(dow, preset.weekly)[c] * 10) / 10;
          const cap = Math.max(dayCap(c, dow), std);
          assert.ok(p[c].suggested <= cap + 1e-9, `${c} over the cap at dow ${dow}`);
        }
      }
    }
  }
});

// --- days left ---------------------------------------------------------

test('daysLeft: Monday has 7, Sunday has 1', () => {
  assert.equal(catchUp(W, zero(), MON).learn.daysLeft, 7);
  assert.equal(catchUp(W, zero(), SUN).learn.daysLeft, 1);
});
