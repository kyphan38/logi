// ============================================================
// logi - Upcoming events (Stage 9).
//
// VERY DIFFERENT from `@/lib/reminders`. That file nudges daily habits,
// inferred from activities. This one holds dates the user types in: weddings,
// deadlines, checkups. A specific date, a countdown to it, and done.
//
// Pure file, no React → testable with `node --test`.
//
// THIS IS THE ORIGINAL. `functions/src/events.ts` is a copy for the Cloud
// Function - change it here and you MUST change it there too
// (`test/events-parity.test.ts` keeps them in sync).
// ============================================================

import { logicalDate } from '@/lib/balance';
import { MILESTONES, type EventItem, type Milestone } from '@/types/logi';

// ------------------------------------------------------------
// Dates
// ------------------------------------------------------------

/**
 * "2026-10-15" → epoch of UTC midnight.
 *
 * UTC on purpose, not device time: only the DIFFERENCE between two dates is
 * needed, and in UTC every day is exactly 24 hours. The Cloud Function runs in
 * UTC while the app runs at +07:00 - going through local time invites the two
 * to differ by a day.
 */
function midnightUTC(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * Days from TODAY (logical day) to `date`. Negative = past.
 *
 * Must subtract calendar days, not `(target - now) / 86400000`. Subtracting ms
 * makes tomorrow's event 0 days away at 23:00 - the user gets a "Today"
 * notification for something not here yet.
 */
export function daysUntil(date: string, now: number): number {
  return daysBetween(logicalDate(now), date);
}

/** Days from `from` to `to`. Negative = `to` is past. The functions copy mirrors this exactly. */
export function daysBetween(from: string, to: string): number {
  return Math.round((midnightUTC(to) - midnightUTC(from)) / 86_400_000);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-10-15" → "Wed, Oct 15".
 *
 * Built by hand, not `toLocaleDateString()`: that reads the running machine's
 * locale and timezone, so one date gives a different weekday in the app
 * (+07:00) and the Cloud Function (UTC).
 */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY[dow]}, ${MONTH[m - 1]} ${d}`;
}

/**
 * Date + time as one phrase: "Mon, Oct 26 · 11:30", or just the date for all day.
 *
 * The time keeps its stored 24-hour form, NOT via `toLocaleTimeString()`: that
 * reads the machine's locale, so the Cloud Function (UTC, default locale) would
 * print one style and the app another.
 */
export function whenLabel(date: string, time: string | null): string {
  return time ? `${dateLabel(date)} · ${time}` : dateLabel(date);
}

/** "2026-10-15" → "Wednesday". When the date is shown elsewhere already. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

// ------------------------------------------------------------
// Countdown text
// ------------------------------------------------------------

/**
 * Day count → a readable phrase. SHARED by the in-app list and push, so the
 * Lock Screen notification says exactly what the user sees in the app.
 *
 * 7 and 14 are said in weeks because that is how people really think of them.
 * "In 14 days" makes the brain divide; "In 2 weeks" does not.
 */
export function countdownText(days: number): string {
  if (days < 0) return days === -1 ? 'Yesterday' : `${-days} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === 7) return 'Next week';
  if (days === 14) return 'In 2 weeks';
  if (days < 21) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

/**
 * The countdown split in two, for the big number block at the start of each row.
 *
 * Must match `countdownText()` at every mark: two places about one event, one
 * saying "7 days" and the other "Next week", makes the user stop and compare.
 * `test/events.test.ts` keeps these two in agreement.
 */
export interface CountdownParts {
  /** A number, or "Today" when there is no number to show. */
  value: string;
  /** The unit. Empty when `value` is already the whole phrase. */
  unit: string;
}

export function countdownParts(days: number): CountdownParts {
  if (days < 0) return { value: String(-days), unit: days === -1 ? 'day ago' : 'days ago' };
  if (days === 0) return { value: 'Today', unit: '' };
  if (days === 7) return { value: '1', unit: 'week' };
  if (days === 14) return { value: '2', unit: 'weeks' };
  if (days < 21) return { value: String(days), unit: days === 1 ? 'day' : 'days' };
  if (days < 60) return { value: String(Math.round(days / 7)), unit: 'weeks' };
  return { value: String(Math.round(days / 30)), unit: 'months' };
}

/** One full line: "In 3 days · Thu, Oct 15". */
export function eventLine(date: string, now: number): string {
  return `${countdownText(daysUntil(date, now))} · ${dateLabel(date)}`;
}

// ------------------------------------------------------------
// Reminder marks
// ------------------------------------------------------------

/**
 * The mark due today and NOT yet sent, or `null`.
 *
 * Only matches the EXACT day count, no "catch-up sends". If the device is off
 * for a day, that mark simply passes: getting "In 7 days" when 6 days remain
 * is a wrong notification, worse than none.
 */
export function dueMilestone(e: EventItem, now: number): Milestone | null {
  const days = daysUntil(e.date, now);
  if (!isMilestone(days)) return null;
  if (e.notified[String(days)] != null) return null;
  return days;
}

export function isMilestone(days: number): days is Milestone {
  return (MILESTONES as readonly number[]).includes(days);
}

// ------------------------------------------------------------
// Sorting
// ------------------------------------------------------------

/** Urgency level, for styling. Unrelated to sending. */
export type Urgency = 'past' | 'today' | 'soon' | 'near' | 'far';

export function urgency(days: number): Urgency {
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= 1) return 'soon';
  if (days <= 3) return 'near';
  return 'far';
}

/**
 * Splits into two blocks in display order.
 *
 * `upcoming` nearest first - what is coming is what needs to be seen first.
 * `past` newest first, since what just passed is what is still remembered.
 */
export function splitEvents(
  list: EventItem[],
  now: number
): { upcoming: EventItem[]; past: EventItem[] } {
  const upcoming: EventItem[] = [];
  const past: EventItem[] = [];
  for (const e of list) (daysUntil(e.date, now) < 0 ? past : upcoming).push(e);
  upcoming.sort((a, b) => cmp(a, b));
  past.sort((a, b) => cmp(b, a));
  return { upcoming, past };
}

/**
 * Date → time → creation time.
 *
 * All-day events (`time === null`) come BEFORE timed events on the same day:
 * they have no time to sort by, and pushing them to the end of the day is wrong.
 * `createdAt` breaks the final tie so the order is stable across renders.
 */
function cmp(a: EventItem, b: EventItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time ?? '';
  const bt = b.time ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.createdAt - b.createdAt;
}
