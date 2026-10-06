// ---------------------------------------------------------------------------
// logi functions - Logical day
//
// A COPY of the rules in `src/lib/balance.ts`. Functions run apart from the
// app, so they cannot share imports. Change the rules in the app, change them here TOO.
//
// Vietnam has no daylight saving, so the offset is always +07:00. A fixed
// number instead of Intl removes one layer that could go wrong.
// ---------------------------------------------------------------------------

export const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_CUTOFF_HOUR = 4;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Logical date "2026-08-28". The day starts at 04:00, not midnight. */
export function logicalDate(now: number): string {
  return new Date(now + TZ_OFFSET_MS - DAY_CUTOFF_HOUR * HOUR).toISOString().slice(0, 10);
}

/** Epoch time of an hour in a logical day. `markAt('2026-08-28', 6, 15)`. */
export function markAt(date: string, hour: number, minute = 0): number {
  return Date.parse(`${date}T00:00:00Z`) - TZ_OFFSET_MS + hour * HOUR + minute * 60_000;
}

/** Start of the logical day = 04:00 local time. */
export function dayStart(date: string): number {
  return markAt(date, DAY_CUTOFF_HOUR);
}

/** 0 = Sunday, like the app's `logicalWeekday()`. */
export function logicalWeekday(now: number): number {
  return new Date(`${logicalDate(now)}T00:00:00Z`).getUTCDay();
}

/** ISO week "2026-W35" - must match the app's `logicalWeek()` character for character. */
export function logicalWeek(now: number): string {
  const d = new Date(`${logicalDate(now)}T00:00:00Z`);
  // The Thursday of the week decides which year it belongs to (ISO 8601).
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
