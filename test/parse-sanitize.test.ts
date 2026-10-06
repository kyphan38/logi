import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeParse } from '@/lib/parse-sanitize';
import { at, H } from './_helpers.ts';

const NOW = at('2026-08-26', '12:00');
const IDS = new Set(['a1']);
const opts = { now: NOW, knownIds: IDS };

/** Minimal valid ParseResult - each test breaks one field. */
function base(over: Record<string, unknown> = {}) {
  return {
    intent: 'log_past',
    category: 'work',
    label: 'devops',
    startAt: new Date(NOW - 2 * H).toISOString(),
    endAt: new Date(NOW - H).toISOString(),
    confidence: 0.9,
    clarifyQuestion: null,
    clarifyOptions: null,
    targetActivityId: null,
    transcript: 'I worked on devops',
    ...over,
  } as never;
}

test('sanitize: a valid result passes, times become epoch ms', () => {
  const r = sanitizeParse(base(), opts);
  assert.equal(r.intent, 'log_past');
  assert.equal(r.category, 'work');
  assert.equal(r.startAt, NOW - 2 * H);
  assert.equal(r.endAt, NOW - H);
  assert.equal(r.confidence, 0.9);
});

test('sanitize: unknown category → null + clarify', () => {
  const r = sanitizeParse(base({ category: 'cooking' }), opts);
  assert.equal(r.category, null);
  assert.equal(r.intent, 'clarify');
  assert.ok(r.clarifyQuestion);
});

test('sanitize: null category is fine ("stop")', () => {
  const r = sanitizeParse(base({ intent: 'stop', category: null }), opts);
  assert.equal(r.intent, 'stop');
  assert.equal(r.category, null);
});

test('sanitize: garbage date → null', () => {
  const r = sanitizeParse(base({ startAt: 'yesterday morning', endAt: '' }), opts);
  assert.equal(r.startAt, null);
  assert.equal(r.endAt, null);
});

test('sanitize: more than 7 days back → clarify', () => {
  for (const days of [8, 10]) {
    const r = sanitizeParse(base({ startAt: new Date(NOW - days * 24 * H).toISOString() }), opts);
    assert.equal(r.intent, 'clarify', `${days} days back must ask again`);
  }
});

test('sanitize: more than 24h in the future → clarify', () => {
  const r = sanitizeParse(
    base({ startAt: new Date(NOW + 30 * H).toISOString(), endAt: null }),
    opts,
  );
  assert.equal(r.intent, 'clarify');
});

test('sanitize: schedule within the next 24h is kept', () => {
  const r = sanitizeParse(
    base({ intent: 'schedule', startAt: new Date(NOW + 4 * H).toISOString(), endAt: null }),
    opts,
  );
  assert.equal(r.intent, 'schedule');
});

test('sanitize: end <= start → drop end, no clarify', () => {
  const r = sanitizeParse(base({ endAt: new Date(NOW - 3 * H).toISOString() }), opts);
  assert.equal(r.endAt, null);
  assert.equal(r.intent, 'log_past');
});

test('sanitize: longer than 15h → clarify with a question', () => {
  const r = sanitizeParse(
    base({ startAt: new Date(NOW - 20 * H).toISOString(), endAt: new Date(NOW).toISOString() }),
    opts,
  );
  assert.equal(r.intent, 'clarify');
  assert.match(r.clarifyQuestion ?? '', /15 hours/);
});

test('sanitize: confidence outside [0,1] or missing → 0', () => {
  assert.equal(sanitizeParse(base({ confidence: 1.5 }), opts).confidence, 0);
  assert.equal(sanitizeParse(base({ confidence: 7 }), opts).confidence, 0);
  assert.equal(sanitizeParse(base({ confidence: -1 }), opts).confidence, 0);
  assert.equal(sanitizeParse(base({ confidence: undefined }), opts).confidence, 0);
});

test('sanitize: unknown targetActivityId → null, a real id is kept', () => {
  assert.equal(sanitizeParse(base({ targetActivityId: 'zzz' }), opts).targetActivityId, null);
  assert.equal(sanitizeParse(base({ targetActivityId: 'a1' }), opts).targetActivityId, 'a1');
});

test('sanitize: transcript and label cut at 200 chars', () => {
  const long = 'x'.repeat(500);
  const r = sanitizeParse(base({ transcript: long, label: long }), opts);
  assert.equal(r.transcript.length, 200);
  assert.equal(r.label?.length, 200);
});

test('sanitize: unknown intent → unknown', () => {
  assert.equal(sanitizeParse(base({ intent: 'delete_everything' }), opts).intent, 'unknown');
});

test('sanitize: empty body does not crash', () => {
  const r = sanitizeParse(null, opts);
  assert.equal(r.intent, 'unknown');
  assert.equal(r.transcript, '');
  assert.equal(r.confidence, 0);
});

// ---------------------------------------------------------------------------
// Backdated start: "started 30 minutes ago and STILL going".
// The model often reads a past time as log_past → the card asks for an end
// time that does not exist. This safety net only fixes a wrong model choice.
// ---------------------------------------------------------------------------

test('sanitize: log_past without endAt → becomes start, startAt kept', () => {
  const r = sanitizeParse(
    base({
      intent: 'log_past',
      startAt: new Date(NOW - 30 * 60_000).toISOString(),
      endAt: null,
      transcript: "I started watching YouTube 30 minutes ago and haven't finished yet",
    }),
    opts,
  );
  assert.equal(r.intent, 'start');
  assert.equal(r.startAt, NOW - 30 * 60_000);
  assert.equal(r.endAt, null);
});

test('sanitize: start with an endAt → drop endAt ("until now" is not an end time)', () => {
  const r = sanitizeParse(
    base({
      intent: 'start',
      startAt: new Date(NOW - 30 * 60_000).toISOString(),
      endAt: new Date(NOW).toISOString(),
      transcript: 'I am watching YouTube, started 30 minutes ago, until now still watching',
    }),
    opts,
  );
  assert.equal(r.intent, 'start');
  assert.equal(r.startAt, NOW - 30 * 60_000);
  assert.equal(r.endAt, null);
});

test('sanitize: log_past with both times is NOT turned into start', () => {
  const r = sanitizeParse(base(), opts);
  assert.equal(r.intent, 'log_past');
  assert.equal(r.endAt, NOW - H);
});

// The user DID give an end time, it just makes no sense. Do not turn it into
// a running session - ask for the end time again.
test('sanitize: end <= start stays log_past, skips the safety net', () => {
  const r = sanitizeParse(base({ endAt: new Date(NOW - 3 * H).toISOString() }), opts);
  assert.equal(r.intent, 'log_past');
  assert.equal(r.endAt, null);
});

test('sanitize: bedtime keeps exactly one time, NOT an activity', () => {
  const r = sanitizeParse(
    base({
      intent: 'bedtime',
      category: 'leisure',
      bedtimeAt: new Date(NOW - H).toISOString(),
      transcript: 'going to bed now',
    }),
    opts,
  );
  assert.equal(r.intent, 'bedtime');
  assert.equal(r.bedtimeAt, NOW - H);
  assert.equal(r.category, null, 'bedtime must not carry a category');
  assert.equal(r.startAt, null);
  assert.equal(r.endAt, null);
});

test('sanitize: non-bedtime phrase always has bedtimeAt null', () => {
  const r = sanitizeParse(base({ bedtimeAt: new Date(NOW - H).toISOString() }), opts);
  assert.equal(r.intent, 'log_past');
  assert.equal(r.bedtimeAt, null);
});
