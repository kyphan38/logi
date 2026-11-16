import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gaugeNote, hours } from '@/lib/day-target';
import { newRecordDefaults } from '@/lib/record-defaults';

test('hours drops a trailing .0 and keeps one decimal', () => {
  assert.equal(hours(3.94), '3.9');
  assert.equal(hours(1.0), '1');
  assert.equal(hours(0), '0');
});

test('gaugeNote: week done beats at cap', () => {
  assert.equal(gaugeNote({ met: true, capped: true } as never), 'week done');
  assert.equal(gaugeNote({ met: false, capped: true } as never), 'at cap');
  assert.equal(gaugeNote({ met: false, capped: false } as never), '');
});

test('newRecordDefaults: today is the last hour, rounded to 15 minutes', () => {
  const now = new Date(2026, 10, 16, 14, 37).getTime();
  const t = newRecordDefaults('2026-11-16', '2026-11-16', now);
  assert.equal(t.mode, 'create');
  assert.equal((t as { endAt: number }).endAt, new Date(2026, 10, 16, 14, 30).getTime());
  assert.equal((t as { startAt: number }).startAt, new Date(2026, 10, 16, 13, 30).getTime());
});

test('newRecordDefaults: a past day is 12:00 to 13:00 of that day', () => {
  const t = newRecordDefaults('2026-11-10', '2026-11-16', Date.now());
  assert.equal((t as { startAt: number }).startAt, new Date(2026, 10, 10, 12).getTime());
  assert.equal((t as { endAt: number }).endAt, new Date(2026, 10, 10, 13).getTime());
});
