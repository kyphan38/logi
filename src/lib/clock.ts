// ---------------------------------------------------------------------------
// logi - Reading an "HH:MM" string into an epoch time
//
// People type times, almost never dates. When the date is NOT known, it is
// derived by one rule, shared by the "when did it start" sheet and the
// bedtime sheet on Now:
//
//     'past'   → the MOST RECENT PAST occurrence of that time
//     'future' → the NEXT occurrence
//
// This rule handles crossing midnight by itself, where a date picker would
// make the user think:
//
//     Sat 07:30 + "23:30" → Fri 23:30      (not reached today yet, so yesterday)
//     Sat 07:30 + "01:00" → Sat 01:00      (already passed, so today)
//     Sat 00:30 + "23:50" → Fri 23:50
//
// It already fits `logicalDate()`'s 04:00 cut: Sat 01:00 still belongs to
// Friday's logical day, so "last night" comes out right without this code
// knowing about the cut.
//
// Where the date IS known, use `resolveClockOnDate()`: on History the user
// picks the day first, then types the time, so "most recent past" is both
// redundant and wrong - it never reaches beyond 24 hours.
//
// Pure file: no React, no Firestore, no DOM.
// ---------------------------------------------------------------------------
import { formatDuration } from '@/lib/datetime';
import { DAY_CUTOFF_HOUR } from '@/types/logi';

/** Accepts "7:15" and "07:15" - iOS returns the zero-padded form, hand typing does not. */
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

export type ClockDir = 'past' | 'future';

/**
 * "07:15" → the nearest epoch time in the given direction. Bad format → `null`.
 *
 * Moves days with `setDate()`, not by adding 24 hours: correct where daylight
 * saving exists. Vietnam has none, but a time function that breaks by timezone
 * is the kind of bug nobody finds later.
 */
export function resolveClockTime(hhmm: string, now: number, dir: ClockDir): number | null {
  const c = parseClock(hhmm);
  if (!c) return null;

  const d = new Date(now);
  d.setHours(c.h, c.min, 0, 0);

  // Exactly `now` stays as is: that is "now", not yesterday.
  if (dir === 'past' && d.getTime() > now) d.setDate(d.getDate() - 1);
  if (dir === 'future' && d.getTime() <= now) d.setDate(d.getDate() + 1);

  return d.getTime();
}

/** "07:15" → `{ h: 7, min: 15 }`. Bad format or out of range → `null`. */
function parseClock(hhmm: string): { h: number; min: number } | null {
  const m = CLOCK_RE.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "23:30" + logical day '2026-09-05' → an epoch time exactly within that night.
 *
 * Unlike `resolveClockTime`: here the day is an input, not something to guess.
 * So any night's mark can be edited, not only the last two.
 *
 * Logical day D runs from D 04:00 to D+1 04:00, so times BEFORE 04:00 fall on
 * the NEXT calendar day: 01:00 of "Friday night" is 01:00 early Saturday. Skip
 * this and the mark lands a whole day early, the kind of bug nobody catches on rereading.
 */
export function resolveClockOnDate(hhmm: string, date: string): number | null {
  const c = parseClock(hhmm);
  if (!c) return null;

  const dm = DATE_RE.exec(date.trim());
  if (!dm) return null;

  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);

  // Days that do not exist ('2026-09-31', '2026-02-30') must be blocked here:
  // otherwise `Date` quietly rolls into the next month and saves to a night nobody picked.
  const base = new Date(y, mo - 1, d, c.h, c.min, 0, 0);
  if (base.getMonth() !== mo - 1 || base.getDate() !== d) return null;

  // Move days with `setDate` (day 31 rolls into the next month), not +24 hours -
  // correct where daylight saving exists too.
  if (c.h < DAY_CUTOFF_HOUR) base.setDate(base.getDate() + 1);

  const ts = base.getTime();
  return Number.isNaN(ts) ? null : ts;
}

/** ts → "07:15" (24h, exactly what `<input type="time">` takes and returns). */
export function toClockInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * "15m ago" / "in 30m" / "just now".
 *
 * Under a minute, no number: "0m ago" reads as if something is wrong.
 */
export function relativeLabel(ts: number, now: number): string {
  const diff = ts - now;
  if (Math.abs(diff) < 60_000) return 'just now';
  return diff < 0 ? `${formatDuration(-diff)} ago` : `in ${formatDuration(diff)}`;
}
