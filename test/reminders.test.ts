import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickReminder, type Reminder } from '@/lib/reminders';
import { PRESETS, type Activity } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

const WEEKLY = PRESETS.normal.weekly;
const NONE = () => false;

// 2026-09-02 is a Wednesday. 2026-09-06 is a Sunday.
const WED = '2026-09-02';
const SUN = '2026-09-06';

function learn(date: string, time: string, hours: number): Activity {
  const startAt = at(date, time);
  return act({ category: 'learn', startAt, endAt: startAt + hours * H, id: `${date}-${time}` });
}

function pick(now: number, over: Partial<Parameters<typeof pickReminder>[0]> = {}) {
  return pickReminder({ now, day: [], week: [], weekly: WEEKLY, isDismissed: NONE, ...over });
}

// --- Times ------------------------------------------------------------

test('silent before 06:15', () => {
  assert.equal(pick(at(WED, '05:30')), null);
});

test('06:15 with no Learn → morning nudge, with a button', () => {
  const r = pick(at(WED, '06:20'));
  assert.equal(r?.type, 'morning');
  assert.equal(r?.text, 'Morning study not logged yet.');
  assert.equal(r?.action, 'start-learn');
});

test('06:15 with Learn already today → silent', () => {
  const day = [learn(WED, '05:00', 1)];
  assert.equal(pick(at(WED, '06:20'), { day }), null);
});

test('20:45 no evening study → evening nudge, with weekly numbers', () => {
  // Morning study still counts as no evening study.
  const day = [learn(WED, '06:00', 2)];
  const r = pick(at(WED, '20:50'), { day, week: [...day, learn('2026-08-31', '20:00', 12)] });
  assert.equal(r?.type, 'evening');
  assert.match(r!.text, /^Evening study not logged yet\. Learn: \d+(\.\d)?h \/ 31h this week\.$/);
  assert.equal(r?.action, 'start-learn');
});

test('20:45 studied after 19:00 → silent', () => {
  const day = [learn(WED, '19:30', 1)];
  assert.equal(pick(at(WED, '20:50'), { day }), null);
});

test('Learn ending before 19:00 still counts as no evening study', () => {
  const day = [learn(WED, '17:00', 1.5)];
  assert.equal(pick(at(WED, '20:50'), { day })?.type, 'evening');
});

test('running Learn session past 19:00 → counts as studied', () => {
  const running = act({ category: 'learn', startAt: at(WED, '18:30'), endAt: null, id: 'run' });
  assert.equal(pick(at(WED, '20:50'), { day: [running] }), null);
});

// --- Weekly summary ---------------------------------------------------

test('Sun 19:00 always shows, even when study is done', () => {
  const week = [learn(SUN, '19:10', 3)];
  const r = pick(at(SUN, '19:05'), { week });
  assert.equal(r?.type, 'weekly');
  assert.equal(r?.action, null, 'summary is read-only, no button');
  assert.match(r!.text, /^Week wrap-up: /);
});

test('Sun before 19:00 shows no summary yet', () => {
  assert.notEqual(pick(at(SUN, '18:30'), { day: [learn(SUN, '06:00', 2)] })?.type, 'weekly');
});

test('Wednesday 19:00 has no weekly summary', () => {
  assert.notEqual(pick(at(WED, '19:30'))?.type, 'weekly');
});

test('summary includes the biggest gap', () => {
  const week = [
    act({ category: 'work', startAt: at('2026-08-31', '08:00'), endAt: at('2026-08-31', '08:00') + 60 * H, id: 'w' }),
  ];
  const r = pick(at(SUN, '19:05'), { week });
  assert.match(r!.text, /\([+-]\d+%\)/, 'must include the gap percent');
});

// --- Priority: at most ONE nudge --------------------------------------

test('Sun 20:50 no evening study → evening nudge beats summary (newest wins)', () => {
  const r = pick(at(SUN, '20:50'));
  assert.equal(r?.type, 'evening');
});

test('dismissing the evening nudge lets the weekly summary show', () => {
  const r = pick(at(SUN, '20:50'), { isDismissed: (k) => k.includes('evening') });
  assert.equal(r?.type, 'weekly');
});

test('evening nudge beats morning nudge', () => {
  assert.equal(pick(at(WED, '21:00'))?.type, 'evening');
});

// --- Dismiss ----------------------------------------------------------

test('dismiss key is tied to the logical day', () => {
  assert.equal(pick(at(WED, '06:20'))?.key, `reminder:morning:${WED}`);
  assert.equal(pick(at(SUN, '19:05'))?.key, `reminder:weekly:${SUN}`);
});

test('once dismissed, silent for that day', () => {
  const seen: string[] = [];
  const isDismissed = (k: string) => {
    seen.push(k);
    return true;
  };
  assert.equal(pick(at(WED, '06:20'), { isDismissed }), null);
  assert.deepEqual(seen, [`reminder:morning:${WED}`]);
});

test('a new logical day nudges again', () => {
  const dismissed = new Set([`reminder:morning:${WED}`, `reminder:evening:${WED}`]);
  const isDismissed = (k: string) => dismissed.has(k);
  assert.equal(pick(at(WED, '06:20'), { isDismissed }), null);
  // 03:00 next day is still the old logical day - before the 04:00 cutoff.
  assert.equal(pick(at('2026-09-03', '03:00'), { isDismissed }), null);
  assert.equal(pick(at('2026-09-03', '06:20'), { isDismissed })?.type, 'morning');
});

test('02:00 is still "tonight" - evening nudge still on', () => {
  // The logical day runs until 04:00, so late nights belong to yesterday.
  const r = pick(at('2026-09-03', '02:00'));
  assert.equal(r?.type, 'evening');
  assert.equal(r?.key, `reminder:evening:${WED}`);
});

// --- No target --------------------------------------------------------

test('no weekTarget still nudges, just without numbers', () => {
  const r: Reminder | null = pick(at(WED, '20:50'), { weekly: null });
  assert.equal(r?.text, 'Evening study not logged yet.');
});
