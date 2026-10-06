import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  exportNudge,
  parseBackup,
  planRestore,
  previewBackup,
  type BackupFile,
} from '@/lib/backup';
import { toJson } from '@/lib/export';
import { PRESETS } from '@/lib/balance';
import type { Range } from '@/lib/range';
import { act, at } from './_helpers.ts';

const D = '2026-08-25';
const full = (from: string, to: string): Range => ({
  from,
  to,
  kind: 'custom',
  isPartial: false,
});

// 2026-09-06 is the first Sunday of September.
const FIRST_SUN = at('2026-09-06', '10:00');
const MID_MONTH = at('2026-09-16', '10:00');

// ------------------------------------------------------------
// Export reminder
// ------------------------------------------------------------

test('no data → no reminder', () => {
  const n = exportNudge({ lastExport: null, firstRecord: null, now: FIRST_SUN });
  assert.equal(n.show, false);
});

test('never exported, data > 30 days → remind now, no wait for Sunday', () => {
  const n = exportNudge({ lastExport: null, firstRecord: '2026-06-01', now: MID_MONTH });
  assert.equal(n.show, true);
  assert.match(n.text, /Never exported/);
});

test('never exported but only 10 days of use → no reminder yet', () => {
  const n = exportNudge({ lastExport: null, firstRecord: '2026-09-08', now: MID_MONTH });
  assert.equal(n.show, false);
});

test('first Sunday of the month → remind with the day count', () => {
  const n = exportNudge({
    lastExport: at('2026-07-21', '10:00'),
    firstRecord: '2026-01-01',
    now: FIRST_SUN,
  });
  assert.equal(n.show, true);
  assert.equal(n.daysAgo, 47);
  assert.match(n.text, /Last export: 47 days ago/);
});

test('mid-month stays quiet', () => {
  const n = exportNudge({
    lastExport: at('2026-07-21', '10:00'),
    firstRecord: '2026-01-01',
    now: MID_MONTH,
  });
  assert.equal(n.show, false);
});

test('the second Sunday of the month does not count', () => {
  const n = exportNudge({
    lastExport: at('2026-07-21', '10:00'),
    firstRecord: '2026-01-01',
    now: at('2026-09-13', '10:00'),
  });
  assert.equal(n.show, false);
});

test('one day says "day", not "days"', () => {
  const n = exportNudge({
    lastExport: at('2026-09-05', '10:00'),
    firstRecord: '2026-01-01',
    now: FIRST_SUN,
  });
  assert.match(n.text, /1 day ago/);
});

// ------------------------------------------------------------
// Reading the file
// ------------------------------------------------------------

const sample = () => {
  const acts = [
    act({ id: 'a', startAt: at(D, '08:00'), endAt: at(D, '09:00'), category: 'work' }),
    act({ id: 'b', startAt: at(D, '10:00'), endAt: at(D, '11:00'), category: 'learn' }),
  ];
  const targets = new Map([['2026-W35', PRESETS.normal.weekly]]);
  return toJson(acts, full(D, D), targets, at(D, '12:00'));
};

test('reads back exactly the file the app exported', () => {
  const { file, error } = parseBackup(sample());
  assert.equal(error, null);
  assert.equal(file!.activities.length, 2);
  assert.equal(file!.weekTargets.length, 1);
});

test('not JSON → reports an error, does not throw', () => {
  const { file, error } = parseBackup('id,category,label\n1,work,x');
  assert.equal(file, null);
  assert.match(error!, /valid JSON/);
});

test('valid JSON but not a backup → rejected', () => {
  const { file, error } = parseBackup('{"hello":1}');
  assert.equal(file, null);
  assert.match(error!, /No activities/);
});

test('a record without an id is dropped, never written to the DB', () => {
  const bad = JSON.stringify({
    activities: [{ category: 'work', startAt: 1, logicalDate: D }],
  });
  assert.equal(parseBackup(bad).file, null);
});

test('broken records are dropped but good ones are kept', () => {
  const mixed = JSON.stringify({
    activities: [{ nonsense: true }, { id: 'x', category: 'work', startAt: 1, logicalDate: D }],
  });
  const { file } = parseBackup(mixed);
  assert.equal(file!.activities.length, 1);
});

test('an empty array file → rejected', () => {
  assert.equal(parseBackup('{"activities":[]}').file, null);
});

test('the debt ledger comes with an all-time file and reads back', () => {
  const acts = [act({ id: 'a', startAt: at(D, '08:00'), endAt: at(D, '09:00') })];
  const text = toJson(acts, full(D, D), new Map(), at(D, '12:00'), { learn: 6 });
  const { file } = parseBackup(text);
  assert.deepEqual(file!.debt, { learn: 6 });
});

test('a file without debt still reads - an old export', () => {
  const { file } = parseBackup(sample());
  assert.equal(file!.debt, undefined);
});

// ------------------------------------------------------------
// Preview
// ------------------------------------------------------------

test('preview counts records, weeks and the date range right', () => {
  const { file } = parseBackup(sample());
  const p = previewBackup(file!);
  assert.equal(p.records, 2);
  assert.equal(p.weeks, 1);
  assert.equal(p.from, D);
  assert.equal(p.to, D);
  assert.equal(p.targets, 1);
});

// ------------------------------------------------------------
// Restore plan - ADD ONLY
// ------------------------------------------------------------

const file2 = (): BackupFile => parseBackup(sample()).file!;

test('empty database → add everything', () => {
  const plan = planRestore(file2(), new Set());
  assert.equal(plan.add.length, 2);
  assert.equal(plan.skip, 0);
});

test('existing record → skipped, NEVER overwritten', () => {
  const plan = planRestore(file2(), new Set(['a']));
  assert.deepEqual(plan.add.map((x) => x.id), ['b']);
  assert.equal(plan.skip, 1);
});

test('importing a second time → no duplicates', () => {
  const f = file2();
  const first = planRestore(f, new Set());
  const ids = new Set(first.add.map((a) => a.id));
  const second = planRestore(f, ids);
  assert.equal(second.add.length, 0);
  assert.equal(second.skip, 2);
});

test('a duplicate id inside the file is added only once', () => {
  const f = file2();
  f.activities = [...f.activities, f.activities[0]];
  const plan = planRestore(f, new Set());
  assert.equal(plan.add.length, 2);
  assert.equal(plan.skip, 1);
});

test('the plan never contains a delete', () => {
  const plan = planRestore(file2(), new Set(['a', 'b', 'zzz']));
  assert.equal(plan.add.length, 0);
  assert.ok(!('remove' in plan));
});
