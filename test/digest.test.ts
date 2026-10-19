import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDigest,
  canAnalyze,
  digestHash,
  estimateTokens,
  extremeNote,
  hhmm,
  TOKEN_BUDGET,
} from '@/lib/digest';
import { expectedForRange } from '@/lib/range-target';
import { addDays } from '@/lib/timeline';
import type { Range } from '@/lib/range';
import { hasBannedWord } from '@/lib/insight-sanitize';
import { computeSignals } from '@/lib/signals';
import { PRESETS, type Activity, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

const NOW = at('2026-08-31', '12:00');
const WEEK: Range = { from: '2026-08-24', to: '2026-08-30', kind: 'custom', isPartial: false };

function targetsFor(weeks: string[]): Map<string, Record<Category, number>> {
  return new Map(weeks.map((w) => [w, PRESETS.normal.weekly]));
}

const WEEK_TARGETS = targetsFor(['2026-W32', '2026-W33', '2026-W34', '2026-W35']);

function sig(activities: Activity[], range: Range = WEEK, now = NOW) {
  return computeSignals(
    activities,
    range,
    expectedForRange(range, WEEK_TARGETS, now),
    WEEK_TARGETS,
    undefined,
    now
  );
}

function s(category: Category, date: string, from: string, to: string, endDate = date): Activity {
  return act({
    id: `${category}-${date}-${from}`,
    category,
    startAt: at(date, from),
    endAt: at(endDate, to),
  });
}

/** A month of dense data: 5 sessions a day, 31 days. */
function month(): { acts: Activity[]; range: Range } {
  const acts: Activity[] = [];
  for (let i = 0; i < 31; i++) {
    const d = addDays('2026-07-25', i);
    acts.push(
      s('learn', d, '05:00', '07:00'),
      s('work', d, '08:00', '17:30'),
      s('fitness', d, '18:00', '19:00'),
      s('leisure', d, '19:30', '22:30'),
      s('learn', d, '22:30', '23:30')
    );
  }
  return {
    acts,
    range: { from: '2026-07-25', to: '2026-08-24', kind: 'custom', isPartial: false },
  };
}

// ------------------------------------------------------------
// Digest shape
// ------------------------------------------------------------

test('the digest has all 4 categories, each with at least 3 stats', () => {
  const d = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  const totals = d.totals as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(totals).sort(), ['fitness', 'learn', 'leisure', 'work']);
  for (const c of ['learn', 'work', 'fitness', 'leisure']) {
    assert.ok(totals[c], `missing ${c}`);
    assert.ok(Object.keys(totals[c]).length >= 3, `${c} is too thin`);
  }
  const period = d.period as Record<string, unknown>;
  assert.equal(period.days, 7);
  assert.equal(period.preset, 'normal');
  assert.equal(typeof period.label, 'string');
});

test('null stats are dropped from the digest', () => {
  const d = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  // No workouts → no median, no gap.
  const fitness = d.fitness as Record<string, unknown>;
  assert.equal('medianSessionMin' in fitness, false);
  assert.equal('longestGapDays' in fitness, false);
  assert.equal('daysSinceLast' in fitness, false);
  // Only one day with logs → the end-time spread cannot be measured.
  const dayShape = d.dayShape as Record<string, unknown>;
  assert.equal('lastActivityEndSpreadMin' in dayShape, false);
  // No previous period → no comparison column.
  const totals = d.totals as Record<string, Record<string, unknown>>;
  assert.equal('vsPreviousHours' in totals.work, false);
});

test('correlations under 3 samples are left out of the digest', () => {
  const two = buildDigest(
    sig([
      s('work', '2026-08-24', '08:00', '18:30'),
      s('work', '2026-08-25', '08:00', '18:30'),
      s('learn', '2026-08-24', '20:00', '21:00'),
    ])
  );
  const links = (two.links ?? {}) as Record<string, unknown>;
  assert.equal('learnHoursOnDaysWorkOver9h' in links, false);

  const three = buildDigest(
    sig([
      s('work', '2026-08-24', '08:00', '18:30'),
      s('work', '2026-08-25', '08:00', '18:30'),
      s('work', '2026-08-26', '08:00', '18:30'),
      s('learn', '2026-08-24', '20:00', '21:00'),
    ])
  );
  const link = (three.links as Record<string, { value: number; n: number }>)
    .learnHoursOnDaysWorkOver9h;
  assert.equal(link.n, 3);
  assert.ok(Math.abs(link.value - 0.3) < 0.05);
});

test('times are written as HH:MM, not raw minutes', () => {
  const d = buildDigest(
    sig([
      s('learn', '2026-08-24', '20:00', '23:20'),
      s('learn', '2026-08-25', '20:00', '23:20'),
    ])
  );
  const dayShape = d.dayShape as Record<string, unknown>;
  assert.equal(dayShape.medianLastActivityEnd, '23:20');
  assert.equal(dayShape.daysWithActivityAfter23, 2);
  // 1470 minutes = 24:30 on the logical-day axis → must still print the real clock time.
  assert.equal(hhmm(1470), '00:30');
});

test('a month\'s digest stays under the token budget', () => {
  const { acts, range } = month();
  const d = buildDigest(sig(acts, range));
  const tokens = estimateTokens(d);
  assert.ok(tokens < TOKEN_BUDGET, `digest is ${tokens} tokens, over ${TOKEN_BUDGET}`);
  // And it must not contain raw records: no ids, no labels, no epochs.
  const text = JSON.stringify(d);
  assert.equal(/"id"|rawText|"startAt"/.test(text), false);
  assert.equal(/17[0-9]{11}/.test(text), false);
});

test('same data gives the same hash, changing one record changes it', () => {
  const a = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  const b = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  const c = buildDigest(sig([s('work', '2026-08-24', '08:00', '18:00')]));
  assert.equal(digestHash(a), digestHash(b));
  assert.notEqual(digestHash(a), digestHash(c));
  assert.equal(digestHash(a).length, 8);
});

// ------------------------------------------------------------
// The gate
// ------------------------------------------------------------

test('no records → blocked, saying clearly nothing was logged', () => {
  const g = canAnalyze(sig([]));
  assert.equal(g.ok, false);
  assert.match(g.reason!, /Nothing logged/);
});

test('a range under 3 days → blocked', () => {
  const two: Range = { from: '2026-08-24', to: '2026-08-25', kind: 'custom', isPartial: false };
  const g = canAnalyze(sig([s('work', '2026-08-24', '08:00', '17:00')], two));
  assert.equal(g.ok, false);
  assert.match(g.reason!, /at least 3 days/);
});

test('very sparse logs → blocked, with the exact day count', () => {
  // 7 days in the range, only 3 with logs → under the 60% threshold.
  const acts = ['24', '25', '26'].map((d) => s('work', `2026-08-${d}`, '08:00', '17:00'));
  const g = canAnalyze(sig(acts));
  assert.equal(g.ok, false);
  assert.match(g.reason!, /^Only 3 of 7 days are logged well enough\.$/);
  assert.match(g.hint!, /Log more/);
});

test('complete data → allowed to run', () => {
  const { acts, range } = month();
  const g = canAnalyze(sig(acts, range));
  assert.equal(g.ok, true);
  assert.equal(g.reason, undefined);
});

// ------------------------------------------------------------
// Extreme data (Task 8)
// ------------------------------------------------------------

const plain = (over: Record<string, unknown> = {}) => ({
  period: { days: 7 },
  totals: { work: { hours: 43, targetHours: 43 } },
  ...over,
});

test('a normal week stays quiet - saying nothing is the default', () => {
  assert.equal(extremeNote(plain()), null);
});

test('work over 70h/week → says so, still stating plain numbers', () => {
  const note = extremeNote(plain({ totals: { work: { hours: 78, targetHours: 43 } } }))!;
  assert.match(note, /78h a week/);
  assert.match(note, /your own ceiling of 43h/);
});

test('the extreme line has no medical, judging or sleep words', () => {
  const note = extremeNote(plain({ totals: { work: { hours: 96, targetHours: 43 } } }))!;
  assert.equal(hasBannedWord(note), false);
});

test('a long range scales work to one week before comparing', () => {
  // 30 days, 200h of work = 46.7h/week → under the threshold.
  const note = extremeNote(
    plain({ period: { days: 30 }, totals: { work: { hours: 200, targetHours: 184 } } })
  );
  assert.equal(note, null);
});

test('a missing work stat means no wild guess', () => {
  assert.equal(extremeNote({ period: { days: 7 }, totals: {} }), null);
});

test('the digest no longer mentions sleep anywhere', () => {
  const { acts, range } = month();
  const text = JSON.stringify(buildDigest(sig(acts, range)));
  assert.equal(/sleep|bedtime|wake|nap/i.test(text), false);
});
