import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Digest } from '@/lib/digest';
import {
  MAX_OBSERVATIONS,
  NOTHING_NOTABLE,
  hasBannedWord,
  lookupMetric,
  sanitizeInsight,
} from '@/lib/insight-sanitize';

// Fake digest with enough numbers to check against. Same shape as `buildDigest`.
const DIGEST: Digest = {
  period: { label: 'Aug 24 – Aug 30', days: 7, coveragePct: 72 },
  totals: {
    learn: { hours: 12.5, targetHours: 31, deviationPct: -60, sessions: 8 },
    work: { hours: 51.2, targetHours: 43, sessions: 9 },
  },
  dayShape: {
    daysWithAnyLog: 6,
    daysWithActivityAfter23: 4,
    medianLastActivityEnd: '23:40',
    lastActivityEndSpreadMin: 80,
    daysStartingBefore6: 3,
  },
  links: { learnHoursOnDaysWorkOver9h: { value: 0.4, n: 3 } },
};

const obs = (body: string, extra: Record<string, unknown> = {}) => ({
  title: 'Logging ran later',
  body,
  metric: 'dayShape.medianLastActivityEnd',
  severity: 'notable',
  ...extra,
});

const run = (raw: unknown) => sanitizeInsight(raw, DIGEST);

// ------------------------------------------------------------
// Number check
// ------------------------------------------------------------

test('numbers found in the digest keep the insight', () => {
  const r = run({
    observations: [obs('The last log ended at 23:40, with an 80 minute spread across 6 days.')],
  });
  assert.equal(r.observations.length, 1);
  assert.equal(r.note, null);
});

test('a number NOT in the digest → drop the whole insight', () => {
  const r = run({ observations: [obs('The last log ended at 23:40, and learn ran 5.2 hours.')] });
  assert.equal(r.observations.length, 0);
  assert.equal(r.note, NOTHING_NOTABLE);
});

test('a made-up clock time is caught too', () => {
  const r = run({ observations: [obs('The last log landed at 01:15 this week.')] });
  assert.equal(r.observations.length, 0);
});

test('a percent written another way still matches', () => {
  const r = run({ observations: [obs('Coverage was 72% for this period.')] });
  assert.equal(r.observations.length, 1);
});

test('"1h20m" matches lastActivityEndSpreadMin of 80 minutes', () => {
  const r = run({ observations: [obs('The end of the day moved 1h20m across the week.')] });
  assert.equal(r.observations.length, 1);
});

test('times from the day shape may be repeated', () => {
  const r = run({ observations: [obs('Four days ran past 23:00, the last log at 23:40.')] });
  assert.equal(r.observations.length, 1);
});

test('a sentence with no numbers has nothing to check', () => {
  const r = run({ observations: [obs('The logged day is ending later across the period.')] });
  assert.equal(r.observations.length, 1);
});

// ------------------------------------------------------------
// Banned words
// ------------------------------------------------------------

test('a sentence with "because" is dropped', () => {
  const r = run({ observations: [obs('Learn fell to 12.5 hours because work took the evenings.')] });
  assert.equal(r.observations.length, 0);
});

test('other causal phrasings are caught too', () => {
  for (const w of ['due to', 'led to', 'resulted in', 'caused']) {
    assert.equal(hasBannedWord(`Learn dropped ${w} something.`), true, w);
  }
  assert.equal(hasBannedWord('Learn 12.5 hours alongside 51.2 hours of work.'), false);
});

test('a sentence with "burnout" is dropped', () => {
  const r = run({ observations: [obs('Work at 51.2 hours is a burnout risk.')] });
  assert.equal(r.observations.length, 0);
});

test('medical and judging words are both blocked', () => {
  for (const w of ['insomnia', 'depression', 'disorder', 'too much', 'unhealthy', 'you should']) {
    assert.equal(hasBannedWord(`This looks like ${w}.`), true, w);
  }
});

// The app no longer tracks sleep. `dayShape` only gives the first and last log
// times, which the model easily reads as bedtime. The prompt bans it; this is
// the second guard, and it must block even harmless-sounding sentences.
test('every sleep word is blocked, even when the sentence judges nothing', () => {
  for (const w of ['sleep', 'slept', 'bedtime', 'wake up', 'woke', 'nap', 'tired', 'overnight']) {
    assert.equal(hasBannedWord(`The data shows ${w} here.`), true, w);
  }
  const r = run({ observations: [obs('Bedtime settled around 23:40 this week.')] });
  assert.equal(r.observations.length, 0);
  assert.equal(r.note, NOTHING_NOTABLE);
});

test('a dirty title drops the insight too', () => {
  const r = run({ observations: [obs('Learn is fine.', { title: 'Too much work' })] });
  assert.equal(r.observations.length, 0);
});

// ------------------------------------------------------------
// Result shape
// ------------------------------------------------------------

test('6 insights → cut to 4', () => {
  const list = Array.from({ length: 6 }, () => obs('Days with activity after 23:00 were 4.'));
  const r = run({ observations: list });
  assert.equal(r.observations.length, MAX_OBSERVATIONS);
});

test('unknown severity falls back to info; an unknown metric drops the label', () => {
  const r = run({
    observations: [
      obs('Days with activity after 23:00 were 4.', { severity: 'critical', metric: 'made.up' }),
    ],
  });
  assert.equal(r.observations[0].severity, 'info');
  assert.equal(r.observations[0].metric, '');
});

test('if all are dropped, return the default line, not a silent empty array', () => {
  const r = run({ observations: [obs('You slept 3.7 hours because of work.')] });
  assert.deepEqual(r.observations, []);
  assert.equal(r.note, NOTHING_NOTABLE);
});

test('total garbage does not crash', () => {
  assert.equal(run(null).note, NOTHING_NOTABLE);
  assert.equal(run({ observations: 'nope' }).observations.length, 0);
  assert.equal(run({ observations: [{ title: '' }, 42, null] }).observations.length, 0);
});

// ------------------------------------------------------------
// Suggestions & praise
// ------------------------------------------------------------

test('suggestions may cite day-shape times, but the preset must be valid', () => {
  const r = run({
    observations: [obs('Days with activity after 23:00 were 4.')],
    suggestion: { text: 'Protect the 20:30 study block on Tue and Thu.', preset: 'recovery' },
  });
  assert.equal(r.suggestion!.preset, 'recovery');

  const bad = run({
    observations: [obs('Days with activity after 23:00 were 4.')],
    suggestion: { text: 'Try a lighter week.', preset: 'super_mode' },
  });
  assert.equal(bad.suggestion!.preset, null);
});

test('preachy suggestions are dropped', () => {
  const r = run({
    observations: [obs('Days with activity after 23:00 were 4.')],
    suggestion: { text: 'You should sleep more, this is unhealthy.', preset: 'recovery' },
  });
  assert.equal(r.suggestion, null);
});

test('praise gets the same number check as insights', () => {
  const ok = run({
    observations: [obs('Days with activity after 23:00 were 4.')],
    positive: 'Six days logged.',
  });
  assert.equal(ok.positive, 'Six days logged.');

  const bad = run({
    observations: [obs('Days with activity after 23:00 were 4.')],
    positive: 'You hit 14 fitness sessions.',
  });
  assert.equal(bad.positive, null);
});

// ------------------------------------------------------------
// Metric lookup
// ------------------------------------------------------------

test('look up a metric by full path or by leaf name', () => {
  assert.equal(lookupMetric(DIGEST, 'dayShape.medianLastActivityEnd')!.value, '23:40');
  assert.equal(lookupMetric(DIGEST, 'lastActivityEndSpreadMin')!.value, 80);
  assert.equal(lookupMetric(DIGEST, 'totals.learn.hours')!.value, 12.5);
  assert.equal(lookupMetric(DIGEST, 'nope'), null);
  assert.equal(lookupMetric(DIGEST, ''), null);
});
