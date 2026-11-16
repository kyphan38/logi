import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ParsedCommand } from '@/lib/parse-sanitize';
import { describeEntry, planBatch } from '@/lib/voice-batch';
import { at, H } from './_helpers.ts';

const NOW = at('2026-11-16', '20:00');
const cmd = (over: Partial<ParsedCommand>): ParsedCommand =>
  ({
    intent: 'log_past',
    category: 'work',
    label: null,
    startAt: null,
    endAt: null,
    bedtimeAt: null,
    confidence: 0.95,
    clarifyQuestion: null,
    clarifyOptions: null,
    targetActivityId: null,
    transcript: '',
    ...over,
  }) as ParsedCommand;

test('describe: a range, a running start, and a bedtime from last night', () => {
  assert.equal(describeEntry(cmd({ label: 'devops', startAt: at('2026-11-16', '08:00'), endAt: at('2026-11-16', '12:00') }), NOW), 'Work · devops · 08:00-12:00');
  assert.equal(describeEntry(cmd({ intent: 'start', category: 'learn', startAt: NOW - H }), NOW), 'Learn · from 19:00');
  assert.equal(describeEntry(cmd({ intent: 'bedtime', category: null, bedtimeAt: at('2026-11-15', '23:30') }), NOW), 'Bedtime 23:30, yesterday');
});

test('batch: complete entries are ready, ones missing a time are not', () => {
  const items = planBatch(
    [
      cmd({ startAt: at('2026-11-16', '08:00'), endAt: at('2026-11-16', '12:00') }),
      cmd({ category: 'fitness', startAt: at('2026-11-16', '18:00'), endAt: null }),
      cmd({ intent: 'bedtime', category: null, bedtimeAt: at('2026-11-15', '23:30') }),
    ],
    { active: [] },
  );
  assert.deepEqual(items.map((i) => i.ready), [true, false, true]);
});
