// ---------------------------------------------------------------------------
// logi functions - Scheduled reminder push
//
// Runs every 15 minutes. Each run checks: is push on, are we inside a
// reminder window, has this type been sent today. Activity is read only when
// all three are true, so most runs cost a single read.
//
// 96 runs/day × 1 read = ~100 reads/day. Activity reads happen only in the few
// runs around 06:15, 20:45 and Sunday 19:00.
//
// In-app reminders still run alongside. If push breaks, that path remains.
// ---------------------------------------------------------------------------

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import { countdownText, daysBetween, isMilestone, whenLabel } from './events';
import { dayStart, logicalDate, logicalWeek, logicalWeekday, markAt } from './time';

initializeApp();

// Default database of project kyphan38-logi-app.
// See roadmap/PLAN-project-split-logi.md.
const db = getFirestore();

type ReminderType = 'morning' | 'evening' | 'weekly';

/**
 * Only send within one hour after the mark. Later, the message loses meaning:
 * "no morning study yet" at 11 AM is just annoying.
 */
const WINDOW_MS = 60 * 60 * 1000;

interface Candidate {
  type: ReminderType;
  mark: number;
}

/** Candidates by mark time DESCENDING - the latest reminder wins, like `pickReminder()`. */
function candidates(now: number): Candidate[] {
  const today = logicalDate(now);
  const list: Candidate[] = [
    { type: 'evening', mark: markAt(today, 20, 45) },
    { type: 'morning', mark: markAt(today, 6, 15) },
  ];
  if (logicalWeekday(now) === 0) {
    list.push({ type: 'weekly', mark: markAt(today, 19) });
  }
  return list.sort((a, b) => b.mark - a.mark).filter((c) => now >= c.mark && now < c.mark + WINDOW_MS);
}

interface Row {
  category: string;
  status: string;
  startAt: number;
  endAt: number | null;
  durationMin: number | null;
}

async function activitiesOfDay(uid: string, date: string): Promise<Row[]> {
  const snap = await db
    .collection(`users/${uid}/activities`)
    .where('logicalDate', '==', date)
    .get();
  return snap.docs.map((d) => d.data() as Row);
}

async function hoursOfWeek(uid: string, week: string): Promise<number> {
  const snap = await db
    .collection(`users/${uid}/activities`)
    .where('logicalWeek', '==', week)
    .get();
  let min = 0;
  for (const d of snap.docs) {
    const r = d.data() as Row;
    if (r.status === 'scheduled' || r.status === 'abandoned') continue;
    min += r.durationMin ?? 0;
  }
  return min / 60;
}

/** Has the user studied since `from`? Same as `learned()` in reminders.ts. */
function learnedSince(day: Row[], from: number, now: number): boolean {
  return day.some(
    (a) => a.category === 'learn' && a.status !== 'scheduled' && (a.endAt ?? now) > from
  );
}

interface Message {
  title: string;
  body: string;
}

async function buildMessage(
  uid: string,
  type: ReminderType,
  now: number
): Promise<Message | null> {
  const today = logicalDate(now);

  if (type === 'weekly') {
    const h = await hoursOfWeek(uid, logicalWeek(now));
    return { title: 'Week wrap-up', body: `${Math.round(h * 10) / 10}h tracked this week.` };
  }

  const day = await activitiesOfDay(uid, today);
  const from = type === 'morning' ? dayStart(today) : markAt(today, 19);
  // Already studied, stay quiet. Reminding about something just done is the
  // fastest way to teach users to ignore every notification.
  if (learnedSince(day, from, now)) return null;

  return type === 'morning'
    ? { title: 'Morning study', body: 'Not logged yet.' }
    : { title: 'Evening study', body: 'Not logged yet.' };
}

export const pushReminders = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Ho_Chi_Minh',
    region: 'asia-southeast1',
    retryCount: 0,
  },
  async () => {
    const now = Date.now();
    const due = candidates(now);
    if (due.length === 0) return;

    // Only devices with push on. Needs a collection-group index on `meta.token`
    // (declared in firestore.indexes.json).
    const devices = await db.collectionGroup('meta').where('token', '>', '').get();

    for (const device of devices.docs) {
      if (device.id !== 'fcm') continue;
      const uid = device.ref.parent.parent?.id;
      const token = (device.data() as { token?: string }).token;
      if (!uid || !token) continue;

      const today = logicalDate(now);
      const logRef = db.doc(`users/${uid}/meta/pushLog`);
      const log = (await logRef.get()).data() ?? {};
      const sentToday = (log[today] ?? {}) as Record<string, number>;

      // One reminder type, once per logical day. The one hour window is longer
      // than the 15 minute cycle, so without this flag users get the same text four times.
      const pick = due.find((c) => sentToday[c.type] == null);
      if (!pick) continue;

      const msg = await buildMessage(uid, pick.type, now);
      if (!msg) continue;

      try {
        await getMessaging().send({
          token,
          // `data` ONLY, no `notification`: the service worker shows it.
          // With both, the browser shows one and the SW shows another.
          data: { title: msg.title, body: msg.body, tag: pick.type, url: '/now' },
          webpush: { headers: { Urgency: 'high', TTL: '3600' } },
        });

        await logRef.set(
          { [today]: { ...sentToday, [pick.type]: now } },
          { merge: true }
        );
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        // Web tokens die silently (app removed, site data cleared). Delete it;
        // the user can turn push back on in Settings.
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          await device.ref.set({ token: FieldValue.delete() }, { merge: true });
          logger.info('dropped dead token');
        } else {
          logger.error('push failed', code);
        }
      }
    }
  }
);

/**
 * Weekly cleanup of the push log. Without it `meta/pushLog` keeps growing
 * and one day passes the 1MB document limit.
 */
export const trimPushLog = onSchedule(
  { schedule: 'every sunday 03:00', timeZone: 'Asia/Ho_Chi_Minh', region: 'asia-southeast1' },
  async () => {
    const keep = 14;
    const snap = await db.collectionGroup('meta').where('token', '>', '').get();
    for (const device of snap.docs) {
      const uid = device.ref.parent.parent?.id;
      if (!uid) continue;
      const ref = db.doc(`users/${uid}/meta/pushLog`);
      const data = (await ref.get()).data();
      if (!data) continue;
      const dates = Object.keys(data).sort();
      if (dates.length <= keep) continue;
      const drop: Record<string, unknown> = {};
      for (const d of dates.slice(0, dates.length - keep)) drop[d] = FieldValue.delete();
      await ref.update(drop);
    }
  }
);

// ---------------------------------------------------------------------------
// EVENT reminder push
//
// Kept apart from `pushReminders`. They differ in kind: study reminders are a
// habit, timed by hour of day; an event is a calendar date, timed by day.
// Merged, event reminders would swallow study reminders (that function sends
// ONE per run), or the other way round.
//
// Runs ONCE a day at 06:00. No need for every 15 minutes: offsets are in days,
// 95 more runs would not change the result, only cost reads.
// ---------------------------------------------------------------------------


interface EventRow {
  title?: string;
  date?: string;
  /** "11:30", or absent = all day. Does not change the send schedule, only the text. */
  time?: string | null;
  notified?: Record<string, number>;
}

/** At most 2 lines per send. Longer gets cut on the lock screen, which reads worse. */
const MAX_LINES = 2;

export const pushEvents = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'Asia/Ho_Chi_Minh',
    region: 'asia-southeast1',
    retryCount: 0,
  },
  async () => {
    const now = Date.now();
    const today = logicalDate(now);
    const devices = await db.collectionGroup('meta').where('token', '>', '').get();

    for (const device of devices.docs) {
      if (device.id !== 'fcm') continue;
      const uid = device.ref.parent.parent?.id;
      const token = (device.data() as { token?: string }).token;
      if (!uid || !token) continue;

      const snap = await db
        .collection(`users/${uid}/events`)
        .where('archivedAt', '==', null)
        .get();

      // An offset matches the EXACT day count only, no catch-up. Miss a day and
      // that offset is gone: "In 7 days" sent with 6 days left is wrong.
      const due: { id: string; line: string; days: number }[] = [];
      for (const row of snap.docs) {
        const e = row.data() as EventRow;
        if (!e.title || !e.date) continue;
        const days = daysBetween(today, e.date);
        if (!isMilestone(days)) continue;
        if ((e.notified ?? {})[String(days)] != null) continue;
        due.push({ id: row.id, days, line: `${e.title} - ${countdownText(days)}` });
      }
      if (due.length === 0) continue;

      due.sort((a, b) => a.days - b.days);
      const first = due[0]!;
      const head = snap.docs.find((d) => d.id === first.id)!.data() as EventRow;

      const msg =
        due.length === 1
          ? {
              title: head.title!,
              body: `${countdownText(first.days)} - ${whenLabel(head.date!, head.time ?? null)}`,
            }
          : {
              title: `${due.length} reminders`,
              body:
                due.slice(0, MAX_LINES).map((d) => d.line).join(' · ') +
                (due.length > MAX_LINES ? ` and ${due.length - MAX_LINES} more` : ''),
            };

      try {
        await getMessaging().send({
          token,
          data: { title: msg.title, body: msg.body, tag: 'events', url: '/reminders' },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        });
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          await device.ref.set({ token: FieldValue.delete() }, { merge: true });
          logger.info('dropped dead token');
        } else {
          logger.error('event push failed', code);
        }
        // On send failure do NOT mark, so tomorrow's run can retry
        // (if that offset has not passed yet).
        continue;
      }

      // Mark AFTER sending, on the event doc itself. A flag stored next to its
      // data never drifts, even when the date changes.
      for (const d of due) {
        await db.doc(`users/${uid}/events/${d.id}`).set(
          { notified: { [String(d.days)]: now } },
          { merge: true }
        );
      }
    }
  }
);
