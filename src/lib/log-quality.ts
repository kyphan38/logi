// ============================================================
// logi - Log quality (AMENDMENT-remove-sleep section 3.2)
//
// No 24h denominator, no assumptions about sleep.
// Only measures the gaps BETWEEN logged activities.
//
// Pure file: no React, no Firestore, no DOM.
// ============================================================

import { logicalDate } from '@/lib/balance';
import { daysOf } from '@/lib/range';
import type { Activity } from '@/types/logi';

export interface LogQuality {
  /** Hours logged, overlap removed. */
  trackedHours: number;
  /** Gaps BETWEEN each day's first and last activity. */
  gapHours: number;
  /** Sum of (last − first) over days with logs. */
  activeSpanHours: number;
  /** Days with at least 1 activity. */
  loggedDays: number;
  totalDays: number;
  /** gapHours / activeSpanHours. 0 when no day has logs yet. */
  gapRatio: number;
}

/** Only what really happened. Bookings and abandoned sessions do not count. */
function counted(activities: Activity[]): Activity[] {
  return activities.filter((a) => a.status === 'active' || a.status === 'done');
}

/**
 * Merges overlapping spans. Returns logged hours and the first→last span.
 * `end` is the day's end mark: for today it extends to `now`.
 */
function spanOf(
  acts: Activity[],
  now: number,
  isToday: boolean
): { tracked: number; span: number } {
  const iv = acts
    .map((a) => [a.startAt, a.endAt ?? now] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);

  if (iv.length === 0) return { tracked: 0, span: 0 };

  let tracked = 0;
  let maxEnd = -Infinity;
  for (const [s, e] of iv) {
    tracked += e - Math.max(s, Math.min(e, maxEnd));
    maxEnd = Math.max(maxEnd, e);
  }

  const first = iv[0][0];
  // Today is not over: the time from the last activity until now is still a gap.
  const last = isToday ? Math.max(maxEnd, now) : maxEnd;
  return { tracked, span: Math.max(0, last - first) };
}

const H = 3_600_000;

/**
 * Three raw numbers for a range of days: "62h logged · 9h gaps · 5 of 7 days".
 *
 * Time BEFORE each day's first activity and AFTER its last counts nowhere -
 * that is not forgotten logging, just nothing to log.
 */
export function logQuality(
  activities: Activity[],
  range: { from: string; to: string },
  now: number = Date.now()
): LogQuality {
  const today = logicalDate(now);
  const days = daysOf(range);

  const byDate = new Map<string, Activity[]>();
  for (const a of counted(activities)) {
    const d = a.logicalDate || logicalDate(a.startAt);
    const list = byDate.get(d);
    if (list) list.push(a);
    else byDate.set(d, [a]);
  }

  let trackedMs = 0;
  let spanMs = 0;
  let loggedDays = 0;

  for (const day of days) {
    const acts = byDate.get(day);
    if (!acts || acts.length === 0) continue; // nothing logged → adds no span
    const { tracked, span } = spanOf(acts, now, day === today);
    if (tracked <= 0 && span <= 0) continue;
    trackedMs += tracked;
    spanMs += span;
    loggedDays += 1;
  }

  const gapMs = Math.max(0, spanMs - trackedMs);

  return {
    trackedHours: trackedMs / H,
    gapHours: gapMs / H,
    activeSpanHours: spanMs / H,
    loggedDays,
    totalDays: days.length,
    gapRatio: spanMs > 0 ? gapMs / spanMs : 0,
  };
}

/** Same definition, scoped to one logical day. */
export function dayLogQuality(
  activities: Activity[],
  date: string,
  now: number = Date.now()
): LogQuality {
  return logQuality(activities, { from: date, to: date }, now);
}

// ------------------------------------------------------------
// Warnings - BOTH conditions are needed to close the gap
// ------------------------------------------------------------

/** Many gaps between activities. */
export const GAP_RATIO_LIMIT = 0.25;
/** Many days with no logs. */
export const LOGGED_DAYS_LIMIT = 0.6;

/**
 * `gapRatio` alone has a hole: a day with a single 30-minute session has
 * span = 30 minutes, gap = 0, looking perfect while almost nothing was logged.
 * `loggedDays` closes that hole.
 */
export function isThin(q: LogQuality): boolean {
  return (
    q.gapRatio > GAP_RATIO_LIMIT ||
    (q.totalDays > 0 && q.loggedDays / q.totalDays < LOGGED_DAYS_LIMIT)
  );
}

function hours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

/** "62h logged · 9h gaps · 5 of 7 days" */
export function logQualityLine(q: LogQuality): string {
  return `${hours(q.trackedHours)} logged · ${hours(q.gapHours)} gaps · ${q.loggedDays} of ${q.totalDays} days`;
}

/** "9h of gaps across 5 logged days." */
export function thinWarning(q: LogQuality): string {
  return `${hours(q.gapHours)} of gaps across ${q.loggedDays} logged ${q.loggedDays === 1 ? 'day' : 'days'}.\nThe numbers below may not reflect reality.`;
}
