// G10: the faint line on Now from 30 minutes before the planned bedtime.
// Pure: no React, no Firebase.

import { REMIND_BEFORE_MIN, bedtimeMinute, clockOf, type SleepPlan } from '@/lib/sleep-plan';

/** Local epoch time of a minute after 00:00 of a logical date ("2026-11-17"). */
function minuteOf(date: string, minute: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, minute).getTime();
}

/**
 * "Bed at 23:00" from 30 minutes before until the logical day ends, or null.
 * Quiet when the plan is off or tonight's bedtime is already logged.
 */
export function bedtimeHint(plan: SleepPlan, today: string, now: number, loggedAt: number | null): string | null {
  if (!plan.on || loggedAt) return null;
  const bed = bedtimeMinute(plan);
  if (now < minuteOf(today, bed - REMIND_BEFORE_MIN)) return null;
  return `Bed at ${clockOf(bed)}`;
}
