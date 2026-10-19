import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Range } from '@/lib/range';
import { overlapForRange } from '@/lib/range-target';
import { act, at } from './_helpers.ts';

// logi - Hour overlap
//
// We no longer divide by 24h/day. What is worth measuring is overlap: hours
// counted twice because two activities overlap.

const DAY = '2026-08-25'; // a Tuesday
const LATER = at('2026-08-27', '12:00');
const r2 = (x: number) => Math.round(x * 100) / 100;

function full(from: string, to: string): Range {
  return { from, to, kind: 'custom', isPartial: false };
}

test('no overlap → overlap 0', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '19:00'), endAt: at(DAY, '22:00'), category: 'learn' }),
  ];
  assert.equal(overlapForRange(acts, full(DAY, DAY), LATER), 0);
});

test('a session fully inside another → overlap equals it', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '17:00'), category: 'work' }),
    act({ startAt: at(DAY, '14:00'), endAt: at(DAY, '17:00'), category: 'learn' }),
  ];
  assert.equal(r2(overlapForRange(acts, full(DAY, DAY), LATER)), 3);
});

test('three overlapping sessions: the union counts once', () => {
  const acts = [
    act({ id: 'a', startAt: at(DAY, '08:00'), endAt: at(DAY, '12:00'), category: 'work' }),
    act({ id: 'b', startAt: at(DAY, '09:00'), endAt: at(DAY, '11:00'), category: 'learn' }),
    act({ id: 'c', startAt: at(DAY, '10:00'), endAt: at(DAY, '10:30'), category: 'leisure' }),
  ];
  // Raw total 4 + 2 + 0.5 = 6.5h, union only 4h → overlap 2.5h.
  assert.equal(r2(overlapForRange(acts, full(DAY, DAY), LATER)), 2.5);
});

test('the part outside the range is clipped', () => {
  // Both run into the next day, but the range stops at 04:00 on the 26th.
  const acts = [
    act({ startAt: at(DAY, '22:00'), endAt: at('2026-08-26', '06:00'), category: 'work' }),
    act({ startAt: at(DAY, '23:00'), endAt: at('2026-08-26', '06:00'), category: 'learn' }),
  ];
  // The 23:00 → 04:00 window is 5h of overlap.
  assert.equal(r2(overlapForRange(acts, full(DAY, DAY), LATER)), 5);
});

test('a running session counts only up to now', () => {
  const now = at(DAY, '10:00');
  const range: Range = { from: DAY, to: DAY, kind: 'custom', isPartial: true };
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: null, category: 'work' }),
    act({ startAt: at(DAY, '09:00'), endAt: null, category: 'learn', id: 'b' }),
  ];
  assert.equal(r2(overlapForRange(acts, range, now)), 1);
});

test('abandoned / scheduled make no overlap', () => {
  const acts = [
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), category: 'work' }),
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), status: 'abandoned', id: 's' }),
    act({ startAt: at(DAY, '08:00'), endAt: at(DAY, '20:00'), status: 'scheduled', id: 't' }),
  ];
  assert.equal(overlapForRange(acts, full(DAY, DAY), LATER), 0);
});

test('no logs → 0, no NaN', () => {
  const v = overlapForRange([], full(DAY, DAY), LATER);
  assert.equal(v, 0);
  assert.ok(Number.isFinite(v));
});
