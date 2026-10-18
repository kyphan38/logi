import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moraStopFor } from '../functions/src/mora.ts';

const running = { source: 'mora', status: 'active', endAt: null };

test('Stop in logi (an end time) stops mora at that time', () => {
  assert.deepEqual(moraStopFor('mora_r1', running, { ...running, status: 'done', endAt: 5_000 }, 9_000), { runId: 'r1', endAt: 5_000 });
});

test('deleting a running mora record in logi stops mora now', () => {
  assert.deepEqual(moraStopFor('mora_r1', running, undefined, 9_000), { runId: 'r1', endAt: 9_000 });
});

test('stops that mora sent are not echoed back', () => {
  assert.equal(moraStopFor('mora_r1', running, { ...running, status: 'done', endAt: 5_000, stoppedBy: 'mora' }, 9_000), null);
});

test('other records, finished records and label edits are ignored', () => {
  assert.equal(moraStopFor('abc', { ...running, source: 'manual' }, undefined, 9_000), null);
  assert.equal(moraStopFor('mora_r1', { ...running, status: 'done', endAt: 1 }, undefined, 9_000), null);
  assert.equal(moraStopFor('mora_r1', running, { ...running, label: 'renamed' } as never, 9_000), null);
  assert.equal(moraStopFor('mora_r1', undefined, running, 9_000), null);
});
