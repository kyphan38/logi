// ---------------------------------------------------------------------------
// logi - Planned bedtime (G10): wake time minus hours of sleep.
//
// A COPY lives in `functions/src/sleep.ts`; test/sleep-parity.test.ts keeps
// the two equal. Pure: no imports.
// ---------------------------------------------------------------------------

export interface SleepPlan {
  on: boolean;
  /** "06:30", 24-hour. */
  wake: string;
  /** Hours of sleep, 4 to 12, in half hours. */
  hours: number;
}

export const DEFAULT_SLEEP: SleepPlan = { on: false, wake: '06:30', hours: 7.5 };
export const REMIND_BEFORE_MIN = 30;
const CUTOFF_MIN = 4 * 60;
const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Firestore data → a valid plan; bad fields fall back to the default. */
export function cleanSleep(raw: unknown): SleepPlan {
  const d = (raw ?? {}) as Record<string, unknown>;
  const wake = typeof d.wake === 'string' && CLOCK.test(d.wake) ? d.wake : DEFAULT_SLEEP.wake;
  const h = typeof d.hours === 'number' && Number.isFinite(d.hours) ? Math.round(d.hours * 2) / 2 : DEFAULT_SLEEP.hours;
  return { on: d.on === true, wake, hours: Math.min(12, Math.max(4, h)) };
}

/**
 * Bedtime as minutes after 00:00 of the logical day, so 23:00 = 1380 and
 * 00:30 the next night = 1470. Always in [04:00, 04:00 next day).
 */
export function bedtimeMinute(plan: SleepPlan): number {
  const [h = 0, m = 0] = plan.wake.split(':').map(Number);
  let bed = (((h * 60 + m - Math.round(plan.hours * 60)) % 1440) + 1440) % 1440;
  if (bed < CUTOFF_MIN) bed += 1440;
  return bed;
}

/** "23:00" for a minute from `bedtimeMinute`. */
export function clockOf(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
