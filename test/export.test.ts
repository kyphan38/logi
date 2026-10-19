import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BOM,
  CSV_COLUMNS,
  csvField,
  exportFilename,
  isoWithOffset,
  toCsv,
  toJson,
} from '@/lib/export';
import type { Range } from '@/lib/range';
import { PRESETS } from '@/lib/balance';
import { act, at } from './_helpers.ts';

const D = '2026-08-25';

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

const rows = (csv: string) => csv.replace(BOM, '').split('\r\n');

// ---------------------------------------------------------------------------
// Escape - RFC 4180
// ---------------------------------------------------------------------------

test('a label with a comma is wrapped in quotes', () => {
  const csv = toCsv([
    act({ startAt: at(D, '08:00'), endAt: at(D, '09:00'), label: 'devops, then lunch' }),
  ]);
  assert.ok(rows(csv)[1].includes('"devops, then lunch"'));
});

test('double quotes in a label are doubled', () => {
  assert.equal(csvField('he said "go"'), '"he said ""go"""');

  const csv = toCsv([
    act({ startAt: at(D, '08:00'), endAt: at(D, '09:00'), label: 'he said "go"' }),
  ]);
  assert.ok(rows(csv)[1].includes('"he said ""go"""'));
});

test('a newline in a label does not break the row count', () => {
  const csv = toCsv([
    act({ startAt: at(D, '08:00'), endAt: at(D, '09:00'), label: 'line1\nline2' }),
  ]);
  assert.ok(csv.includes('"line1\nline2"'));
});

test('plain text is not wrapped needlessly', () => {
  assert.equal(csvField('work'), 'work');
  assert.equal(csvField(90), '90');
  assert.equal(csvField(null), '');
});

// ---------------------------------------------------------------------------
// Header & columns
// ---------------------------------------------------------------------------

test('header has the right column order', () => {
  const csv = toCsv([]);
  assert.equal(
    rows(csv)[0],
    'id,category,label,start,end,durationMin,logicalDate,logicalWeek,status,source'
  );
  assert.equal(CSV_COLUMNS.length, 10);
});

test('file starts with a BOM so Excel reads UTF-8', () => {
  assert.ok(toCsv([]).startsWith('﻿'));
});

test('a running session leaves end empty, no made-up end time', () => {
  const csv = toCsv([act({ startAt: at(D, '08:00'), endAt: null })]);
  const cells = rows(csv)[1].split(',');
  assert.equal(cells[4], '');
});

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

test('start is ISO 8601 with the local offset', () => {
  const s = isoWithOffset(at(D, '09:30'));
  assert.match(s, /^2026-08-25T09:30:00[+-]\d{2}:\d{2}$/);
  assert.ok(s.endsWith('+07:00'), s); // tests run with TZ=Asia/Ho_Chi_Minh
});

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

test('JSON includes weekTargets to rebuild the vs-plan part', () => {
  const targets = new Map([['2026-W35', PRESETS.normal.weekly]]);
  const acts = [act({ startAt: at(D, '08:00'), endAt: at(D, '09:00') })];
  const parsed = JSON.parse(toJson(acts, full(D, D), targets, at('2026-08-26', '10:00')));

  assert.deepEqual(parsed.range, { from: D, to: D });
  assert.equal(parsed.activities.length, 1);
  assert.deepEqual(parsed.weekTargets, [{ week: '2026-W35', weekly: PRESETS.normal.weekly }]);
  assert.match(parsed.exportedAt, /^2026-08-26T10:00:00/);
});

test('weekTargets sorted by week ascending', () => {
  const targets = new Map([
    ['2026-W36', PRESETS.crunch.weekly],
    ['2026-W35', PRESETS.normal.weekly],
  ]);
  const parsed = JSON.parse(toJson([], full('2026-08-24', '2026-09-06'), targets));
  assert.deepEqual(
    parsed.weekTargets.map((w: { week: string }) => w.week),
    ['2026-W35', '2026-W36']
  );
});

// ---------------------------------------------------------------------------
// File name
// ---------------------------------------------------------------------------

test('file name includes the range', () => {
  assert.equal(exportFilename(full('2026-08-01', '2026-08-31'), 'csv'), 'logi-2026-08-01_2026-08-31.csv');
  assert.equal(exportFilename(full(D, D), 'json'), 'logi-2026-08-25.json');
});
