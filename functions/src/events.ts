// ---------------------------------------------------------------------------
// logi functions - Upcoming events
//
// A COPY of `src/lib/events.ts`. Functions run apart from the app, so they
// cannot share imports. Change wording or offsets in the app, change them here TOO.
//
// `test/events-parity.test.ts` compares both copies over thousands of inputs:
// that is the only thing keeping them in sync. To make that possible this
// file imports NOTHING: `daysBetween()` takes today as a parameter instead of
// calling `logicalDate()`.
// ---------------------------------------------------------------------------

export const MILESTONES = [14, 7, 3, 1, 0] as const;
export type Milestone = (typeof MILESTONES)[number];

/** UTC midnight. See the note in the app copy: local time is NOT used on purpose. */
function midnightUTC(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Days from `from` to `to`. Negative = `to` has passed. */
export function daysBetween(from: string, to: string): number {
  return Math.round((midnightUTC(to) - midnightUTC(from)) / 86_400_000);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-15" → "Wed, Oct 15". Ignores the host locale and time zone. */
export function dateLabel(date: string): string {
  const parts = date.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return date;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY[dow]}, ${MONTH[m - 1]} ${d}`;
}

/** Day count → readable text. Must match the app copy character for character. */
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

export function isMilestone(days: number): days is Milestone {
  return (MILESTONES as readonly number[]).includes(days);
}

/**
 * Date + time as one line: "Mon, Oct 26 · 11:30", or just the date for all-day.
 *
 * The time keeps its stored 24h form, NOT `toLocaleTimeString()`: that reads
 * the host locale, so the Cloud Function (UTC, default locale) would print
 * one format and the app another.
 */
export function whenLabel(date: string, time: string | null): string {
  return time ? `${dateLabel(date)} · ${time}` : dateLabel(date);
}
