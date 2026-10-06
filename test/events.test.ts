import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countdownParts,
  countdownText,
  dateLabel,
  daysUntil,
  dueMilestone,
  isMilestone,
  splitEvents,
  urgency,
  whenLabel,
} from '@/lib/events';
import { MILESTONES, type EventItem } from '@/types/logi';
import { at } from './_helpers.ts';

function ev(o: Partial<EventItem> & { date: string }): EventItem {
  return {
    id: o.id ?? `e-${o.date}`,
    title: o.title ?? 'Something',
    date: o.date,
    time: o.time ?? null,
    note: o.note ?? null,
    notified: o.notified ?? {},
    archivedAt: null,
    createdAt: o.createdAt ?? 0,
    updatedAt: 0,
  };
}

// --- daysUntil: 04:00 cutoff --------------------------------------------

test('within one logical day the day count stays the same at any hour', () => {
  const target = '2026-10-15';
  for (const t of ['04:00', '09:30', '18:00', '23:59']) {
    assert.equal(daysUntil(target, at('2026-10-12', t)), 3, `wrong at ${t}`);
  }
});

test('01:00 still belongs to the previous day - must NOT jump to the next mark', () => {
  // 2026-10-13 at 01:00 is still logical day 2026-10-12 → 3 days left.
  assert.equal(daysUntil('2026-10-15', at('2026-10-13', '01:00')), 3);
  // The new day starts at 04:00.
  assert.equal(daysUntil('2026-10-15', at('2026-10-13', '04:00')), 2);
});

test('23:00 the day before is still "1 day left", not 0', () => {
  assert.equal(daysUntil('2026-10-15', at('2026-10-14', '23:00')), 1);
  assert.equal(countdownText(daysUntil('2026-10-15', at('2026-10-14', '23:00'))), 'Tomorrow');
});

test('today = 0, past = negative', () => {
  assert.equal(daysUntil('2026-10-15', at('2026-10-15', '12:00')), 0);
  assert.equal(daysUntil('2026-10-15', at('2026-10-18', '12:00')), -3);
});

test('across months and years', () => {
  assert.equal(daysUntil('2026-11-01', at('2026-10-31', '12:00')), 1);
  assert.equal(daysUntil('2027-01-01', at('2026-12-25', '12:00')), 7);
  // 2028 is a leap year: 29/02 must exist.
  assert.equal(daysUntil('2028-03-01', at('2028-02-28', '12:00')), 2);
});

// --- Text ----------------------------------------------------------------

test('the 7 and 14 marks are said in weeks', () => {
  assert.equal(countdownText(14), 'In 2 weeks');
  assert.equal(countdownText(7), 'Next week');
  assert.equal(countdownText(3), 'In 3 days');
  assert.equal(countdownText(1), 'Tomorrow');
  assert.equal(countdownText(0), 'Today');
});

test('past events', () => {
  assert.equal(countdownText(-1), 'Yesterday');
  assert.equal(countdownText(-5), '5 days ago');
});

test('far dates switch units, never printing "In 400 days"', () => {
  assert.equal(countdownText(21), 'In 3 weeks');
  assert.equal(countdownText(90), 'In 3 months');
});

test('dateLabel does not depend on the machine time zone', () => {
  // 2026-10-15 is a Wednesday.
  assert.equal(dateLabel('2026-10-15'), 'Thu, Oct 15');
  assert.equal(dateLabel('2026-01-01'), 'Thu, Jan 1');
  assert.equal(dateLabel('2026-12-31'), 'Thu, Dec 31');
});

// --- Reminder marks ------------------------------------------------------

test('on a mark and not sent yet → due', () => {
  const e = ev({ date: '2026-10-15' });
  assert.equal(dueMilestone(e, at('2026-10-01', '06:00')), 14);
  assert.equal(dueMilestone(e, at('2026-10-08', '06:00')), 7);
  assert.equal(dueMilestone(e, at('2026-10-12', '06:00')), 3);
  assert.equal(dueMilestone(e, at('2026-10-14', '06:00')), 1);
  assert.equal(dueMilestone(e, at('2026-10-15', '06:00')), 0);
});

test('that mark already sent → silent', () => {
  const e = ev({ date: '2026-10-15', notified: { '3': 1 } });
  assert.equal(dueMilestone(e, at('2026-10-12', '06:00')), null);
  // Other marks still send as usual.
  assert.equal(dueMilestone(e, at('2026-10-14', '06:00')), 1);
});

test('NO catch-up: a missed day means that mark is gone', () => {
  const e = ev({ date: '2026-10-15' });
  // 2, 6 and 13 days left are not marks.
  assert.equal(dueMilestone(e, at('2026-10-13', '06:00')), null);
  assert.equal(dueMilestone(e, at('2026-10-09', '06:00')), null);
  assert.equal(dueMilestone(e, at('2026-10-02', '06:00')), null);
});

test('a past event is never due', () => {
  const e = ev({ date: '2026-10-15' });
  assert.equal(dueMilestone(e, at('2026-10-16', '06:00')), null);
});

test('MILESTONES are descending and include 14/7/3/1/0', () => {
  assert.deepEqual([...MILESTONES], [14, 7, 3, 1, 0]);
  for (const m of MILESTONES) assert.ok(isMilestone(m));
  assert.equal(isMilestone(2), false);
});

// --- Sorting -------------------------------------------------------------

test('upcoming: nearest first. Past: most recent first', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'far', date: '2026-11-20' }),
    ev({ id: 'old', date: '2026-10-01' }),
    ev({ id: 'soon', date: '2026-10-11' }),
    ev({ id: 'yesterday', date: '2026-10-09' }),
    ev({ id: 'today', date: '2026-10-10' }),
  ];
  const { upcoming, past } = splitEvents(list, now);
  assert.deepEqual(upcoming.map((e) => e.id), ['today', 'soon', 'far']);
  assert.deepEqual(past.map((e) => e.id), ['yesterday', 'old']);
});

test('today is in the UPCOMING block, not past', () => {
  const { upcoming, past } = splitEvents([ev({ date: '2026-10-10' })], at('2026-10-10', '23:00'));
  assert.equal(upcoming.length, 1);
  assert.equal(past.length, 0);
});

test('same day keeps a stable order by creation time', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'b', date: '2026-10-12', createdAt: 200 }),
    ev({ id: 'a', date: '2026-10-12', createdAt: 100 }),
  ];
  assert.deepEqual(splitEvents(list, now).upcoming.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(splitEvents([...list].reverse(), now).upcoming.map((e) => e.id), ['a', 'b']);
});

test('urgency changes at the right points', () => {
  assert.equal(urgency(-1), 'past');
  assert.equal(urgency(0), 'today');
  assert.equal(urgency(1), 'soon');
  assert.equal(urgency(3), 'near');
  assert.equal(urgency(4), 'far');
});

// --- Number block on each row -------------------------------------------

test('countdownParts matches countdownText at every mark, never two styles', () => {
  // "7 days" in the list while the push says "Next week" makes the user
  // stop and compare. Both functions must pick the same unit.
  const unitOf = (n: number) => {
    const t = countdownText(n);
    // "Today" contains "day" - check it before any includes().
    if (t === 'Today') return 'today';
    if (t.includes('week')) return 'week';
    if (t.includes('month')) return 'month';
    if (t.includes('day') || t === 'Tomorrow' || t === 'Yesterday') return 'day';
    return 'today';
  };
  for (let n = -400; n <= 400; n++) {
    const { value, unit } = countdownParts(n);
    const expect = unitOf(n);
    const got = unit === '' ? 'today' : unit.startsWith('week') ? 'week' : unit.startsWith('month') ? 'month' : 'day';
    assert.equal(got, expect, `unit differs at ${n} days: "${value} ${unit}" vs "${countdownText(n)}"`);
  }
});

test('number block at the main marks', () => {
  assert.deepEqual(countdownParts(14), { value: '2', unit: 'weeks' });
  assert.deepEqual(countdownParts(7), { value: '1', unit: 'week' });
  assert.deepEqual(countdownParts(3), { value: '3', unit: 'days' });
  assert.deepEqual(countdownParts(1), { value: '1', unit: 'day' });
  assert.deepEqual(countdownParts(0), { value: 'Today', unit: '' });
  assert.deepEqual(countdownParts(-1), { value: '1', unit: 'day ago' });
});

test('the block number is always short - never overflows', () => {
  for (let n = -400; n <= 400; n++) {
    const { value } = countdownParts(n);
    assert.ok(value.length <= 5, `"${value}" too long at ${n} days`);
  }
});

// --- Time of day ---------------------------------------------------------

test('a time is appended after the date; without one, date only', () => {
  assert.equal(whenLabel('2026-10-26', '11:30'), 'Mon, Oct 26 · 11:30');
  assert.equal(whenLabel('2026-10-26', null), 'Mon, Oct 26');
  // An empty string means all day, with no dangling dot.
  assert.equal(whenLabel('2026-10-26', ''), 'Mon, Oct 26');
});

test('a time does NOT change the days left - marks still count by day', () => {
  const e = ev({ date: '2026-10-15', time: '23:30' });
  assert.equal(dueMilestone(e, at('2026-10-14', '06:00')), 1);
  const allDay = ev({ date: '2026-10-15' });
  assert.equal(daysUntil(e.date, at('2026-10-14', '06:00')), daysUntil(allDay.date, at('2026-10-14', '06:00')));
});

test('same day: all-day first, then by time', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'evening', date: '2026-10-12', time: '19:00' }),
    ev({ id: 'allday', date: '2026-10-12', time: null }),
    ev({ id: 'morning', date: '2026-10-12', time: '06:30' }),
  ];
  const { upcoming } = splitEvents(list, now);
  assert.deepEqual(upcoming.map((e) => e.id), ['allday', 'morning', 'evening']);
});

test('times compare as strings since they are always two digits', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'ten', date: '2026-10-12', time: '10:00' }),
    ev({ id: 'nine', date: '2026-10-12', time: '09:00' }),
  ];
  assert.deepEqual(splitEvents(list, now).upcoming.map((e) => e.id), ['nine', 'ten']);
});
