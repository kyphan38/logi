import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLiveRequest, startDoc, planStop, docId, MIN_RUN_MS } from '@/lib/mora-live';

const NOW = Date.UTC(2026, 9, 18, 3, 0); // 10:00 in Vietnam

test('start: a running mora record with a stable id', () => {
  const r = readLiveRequest({ action: 'start', runId: 'run-1', kind: 'work', label: ' Ship ', startAt: NOW - 5_000 }, NOW);
  assert.equal(docId(r.runId), 'mora_run-1');
  const d = startDoc(r as Extract<typeof r, { action: 'start' }>, NOW);
  assert.equal(d.status, 'active');
  assert.equal(d.endAt, null);
  assert.equal(d.category, 'work');
  assert.equal(d.label, 'Ship');
  assert.equal(d.source, 'mora');
});

test('bad requests are refused', () => {
  assert.throws(() => readLiveRequest({ action: 'start', runId: 'has space', startAt: NOW }, NOW));
  assert.throws(() => readLiveRequest({ action: 'start', runId: 'x', kind: 'leisure', startAt: NOW }, NOW));
  assert.throws(() => readLiveRequest({ action: 'start', runId: 'x', startAt: NOW + 3_600_000 }, NOW));
  assert.throws(() => readLiveRequest({ action: 'pause', runId: 'x' }, NOW));
  assert.throws(() => readLiveRequest({ action: 'stop', runId: 'x' }, NOW));
});

test('stop finishes a running record and marks mora as the cause', () => {
  const plan = planStop({ status: 'active', startAt: NOW - 30 * 60_000 }, NOW, NOW);
  assert.equal(plan.kind, 'finish');
  if (plan.kind !== 'finish') return;
  assert.equal(plan.patch.endAt, NOW);
  assert.equal(plan.patch.status, 'done');
  assert.equal(plan.patch.durationMin, 30);
  assert.equal(plan.patch.stoppedBy, 'mora');
});

test('a run under a minute is removed; repeats and finished records are ignored', () => {
  assert.equal(planStop({ status: 'active', startAt: NOW - MIN_RUN_MS + 1 }, NOW, NOW).kind, 'delete');
  assert.equal(planStop(undefined, NOW, NOW).kind, 'ignore');
  assert.equal(planStop({ status: 'done', startAt: NOW - 3_600_000 }, NOW, NOW).kind, 'ignore');
});
