import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayWindow, addDays, layoutDay, dayGaps, toPx, HOUR_PX } from '@/lib/timeline';
import { act, at, H } from './_helpers.ts';

test('dayWindow runs from 04:00 to 04:00 next day', () => {
  const w = dayWindow('2026-08-26');
  assert.equal(w.start, at('2026-08-26', '04:00'));
  assert.equal(w.end, at('2026-08-27', '04:00'));
  assert.equal(w.end - w.start, 24 * H);
});

test('addDays crosses month and year starts', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-08-26', -30), '2026-07-27');
});

test('toPx: 04:00 is 0, each hour is HOUR_PX', () => {
  const w = dayWindow('2026-08-26');
  assert.equal(toPx(w.start, w), 0);
  assert.equal(toPx(w.start + H, w), HOUR_PX);
});

// --- Lanes (section 13: two overlapping records) ----------------------------

test('layoutDay: two overlapping blocks go in two lanes', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '12:00') });
  const l = layoutDay([a, b], w, now);
  assert.equal(l.laneCount, 2);
  assert.deepEqual(l.segments.map((s) => s.lane), [0, 1]);
});

test('layoutDay: blocks far apart share lane 0', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '10:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '14:00'), endAt: at('2026-08-26', '15:00') });
  const l = layoutDay([a, b], w, now);
  assert.equal(l.laneCount, 1);
  assert.deepEqual(l.segments.map((s) => s.lane), [0, 0]);
});

test('layoutDay: two back-to-back 5-minute blocks do not overlap', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '09:05') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '09:05'), endAt: at('2026-08-26', '09:10') });
  const l = layoutDay([a, b], w, now);
  assert.equal(l.laneCount, 2, 'blocks too short, so split lanes for easy tapping');
});

test('layoutDay: session crossing 04:00 is NOT cut (one night shift = one row)', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-27', '10:00');
  const night = act({
    category: 'work',
    startAt: at('2026-08-26', '22:00'),
    endAt: at('2026-08-27', '06:00'),
  });
  const [s] = layoutDay([night], w, now).segments;
  assert.equal(s.end, at('2026-08-27', '06:00'), 'keeps the real end time');
  assert.equal(s.crossesMidnight, true);
});

test('layoutDay: a running session ends at now', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '15:30');
  const a = act({ startAt: at('2026-08-26', '14:00'), endAt: null });
  const [s] = layoutDay([a], w, now).segments;
  assert.equal(s.end, now);
  assert.equal(s.crossesMidnight, false);
});

test('layoutDay: drops records outside the day window', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-25', '09:00'), endAt: at('2026-08-25', '10:00') });
  assert.equal(layoutDay([a], w, now).segments.length, 0);
});

// --- Gaps in the day (AMENDMENT-remove-sleep section 6) -----------

test('dayGaps merges overlaps when computing trackedH', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '12:00') });
  const { segments } = layoutDay([a, b], w, now);
  const c = dayGaps(segments, w, now);
  assert.equal(c.trackedH, 3, '09:00–12:00 = 3h, not 4h');
  assert.equal(c.gapH, 0, '04:00–09:00 is before the first record → not counted');
});

test('dayGaps: time before the first and after the last record is not a gap', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-28', '12:00'); // viewing a past day
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const c = dayGaps(layoutDay([a], w, now).segments, w, now);
  assert.equal(c.gapH, 0);
  assert.equal(c.gaps.length, 0, 'no "17h untracked" row at the end');
  assert.equal(c.from, at('2026-08-26', '09:00'));
  assert.equal(c.to, at('2026-08-26', '11:00'));
});

test('dayGaps: today the right edge is now → the time just passed is a gap', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const c = dayGaps(layoutDay([a], w, now).segments, w, now);
  assert.equal(c.gapH, 1, '11:00 → 12:00 really is not logged');
  assert.equal(c.gaps.length, 1);
});

test('dayGaps: a gap BETWEEN two records still counts', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '18:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '14:00'), endAt: at('2026-08-26', '18:00') });
  const c = dayGaps(layoutDay([a, b], w, now).segments, w, now);
  assert.equal(c.trackedH, 6);
  assert.equal(c.gapH, 3, '11:00 → 14:00');
  assert.equal(c.gaps.length, 1);
});

test('dayGaps: a fully empty day → no marks', () => {
  const w = dayWindow('2026-08-26');
  const c = dayGaps([], w, at('2026-08-26', '05:00'));
  assert.equal(c.trackedH, 0);
  assert.equal(c.gapH, 0);
  assert.equal(c.from, null);
  assert.equal(c.to, null);
});

test('dayGaps only reports gaps of 30 minutes or more', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '04:00'), endAt: at('2026-08-26', '09:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '09:20'), endAt: at('2026-08-26', '12:00') });
  const { segments } = layoutDay([a, b], w, now);
  assert.equal(dayGaps(segments, w, now).gaps.length, 0, 'a 20 minute gap is ignored');
});

// --- A2 (changed by AMENDMENT sleep-boundary) ---------------------------
test('layoutDay: a normal record within the day → crossesMidnight = false', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const [s] = layoutDay([a], w, now).segments;
  assert.equal(s.crossesMidnight, false);
});

test('layoutDay: a session from the day before that ends before 04:00 is not drawn', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({
    startAt: at('2026-08-25', '20:00'),
    endAt: at('2026-08-25', '23:00'),
  });
  assert.equal(layoutDay([a], w, now).segments.length, 0);
});
