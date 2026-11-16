import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ParsedCommand } from '@/lib/parse-sanitize';
import { annotateEntries, describeRecord } from '@/lib/voice-context';
import { describeEntry } from '@/lib/voice-batch';
import { act, at } from './_helpers.ts';

const NOW = at('2026-08-26', '20:00');

function cmd(o: Partial<ParsedCommand>): ParsedCommand {
  return {
    intent: 'log_past',
    category: 'learn',
    label: null,
    startAt: null,
    endAt: null,
    bedtimeAt: null,
    confidence: 0.9,
    clarifyQuestion: null,
    clarifyOptions: null,
    targetActivityId: null,
    transcript: 't',
    ...o,
  };
}

const work = act({ id: 'w1', category: 'work', label: 'devops', startAt: at('2026-08-26', '08:00'), endAt: at('2026-08-26', '12:00') });
const gymYesterday = act({ id: 'g1', category: 'fitness', startAt: at('2026-08-25', '18:00'), endAt: at('2026-08-25', '19:00') });
const running = act({ id: 'r1', category: 'work', startAt: at('2026-08-26', '17:00') });

test('describeRecord names category, label, times and the day', () => {
  assert.equal(describeRecord(work, NOW), 'Work · devops · 08:00-12:00');
  assert.equal(describeRecord(gymYesterday, NOW), 'Fitness · 18:00-19:00, yesterday');
  assert.equal(describeRecord(running, NOW), 'Work · 17:00-now');
});

test('a block that runs into a saved record gets an overlap note', () => {
  const [e] = annotateEntries([cmd({ startAt: at('2026-08-26', '11:00'), endAt: at('2026-08-26', '13:00') })], [work], NOW);
  assert.equal(e.overlap, 'Work 08:00-12:00');
});

test('touching ends are not an overlap', () => {
  const [e] = annotateEntries([cmd({ startAt: at('2026-08-26', '12:00'), endAt: at('2026-08-26', '13:00') })], [work], NOW);
  assert.equal(e.overlap, null);
});

test('several hits are counted', () => {
  const [e] = annotateEntries([cmd({ startAt: at('2026-08-26', '07:00'), endAt: at('2026-08-26', '19:00') })], [work, running], NOW);
  assert.equal(e.overlap, 'Work 08:00-12:00 and 1 more');
});

test('switching: a start now does not overlap the session stopped in the same breath', () => {
  const out = annotateEntries(
    [cmd({ intent: 'stop', category: null, targetActivityId: 'r1' }), cmd({ intent: 'start', category: 'fitness', startAt: NOW })],
    [running],
    NOW,
  );
  assert.equal(out[0].targetText, 'Work · 17:00-now');
  assert.equal(out[1].overlap, null);
});

test('a start in the past overlaps what was logged since then', () => {
  const [e] = annotateEntries([cmd({ intent: 'start', startAt: at('2026-08-26', '11:00') })], [work], NOW);
  assert.equal(e.overlap, 'Work 08:00-12:00');
});

test('edit of an older record: names it, and ignores itself in the overlap', () => {
  const [e] = annotateEntries(
    [cmd({ intent: 'edit', category: null, targetActivityId: 'g1', endAt: at('2026-08-25', '20:00') })],
    [gymYesterday],
    NOW,
  );
  assert.equal(e.targetText, 'Fitness · 18:00-19:00, yesterday');
  assert.equal(e.overlap, null);
});

test('delete names its target and the batch line uses it', () => {
  const [e] = annotateEntries([cmd({ intent: 'delete', category: null, targetActivityId: 'g1' })], [gymYesterday], NOW);
  assert.equal(describeEntry(e, NOW), 'Delete Fitness · 18:00-19:00, yesterday');
});

test('an unknown target gives no text', () => {
  const [e] = annotateEntries([cmd({ intent: 'delete', category: null, targetActivityId: 'zz' })], [work], NOW);
  assert.equal(e.targetText, null);
  assert.equal(e.overlap, null);
});

