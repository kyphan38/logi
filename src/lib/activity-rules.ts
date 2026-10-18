// ============================================================
// logi - Activity rules: validation and derived fields.
// Pure (no Firebase), so both the client repository (activities.ts) and
// server routes use the same checks.
// ============================================================

import { logicalDate, logicalWeek, isoWeekOf } from '@/lib/balance';
import {
  CATEGORIES,
  MAX_SESSION_MIN,
  DAY_CUTOFF_HOUR,
  type ActivityStatus,
  type Category,
} from '@/types/logi';

// ------------------------------------------------------------
// Constraint constants
// ------------------------------------------------------------

const MS_MIN = 60_000;
const MAX_SESSION_MS = MAX_SESSION_MIN * MS_MIN; // 15h
const MAX_BACKDATE_MS = 7 * 24 * 60 * MS_MIN;    // 7 days
/** Allows slight clock skew when comparing with "the future". */
const CLOCK_SKEW_MS = 60_000;

export type ActivityErrorCode =
  | 'duplicate'
  | 'end-before-start'
  | 'too-long'
  | 'too-old'
  | 'future'
  | 'bad-category'
  | 'not-found';

/** Errors with a code so the UI can tell them apart (e.g. 'duplicate' → toast, not a crash). */
export class ActivityError extends Error {
  code: ActivityErrorCode;
  constructor(code: ActivityErrorCode, message: string) {
    super(message);
    this.name = 'ActivityError';
    this.code = code;
  }
}

// ------------------------------------------------------------
// Derived fields - the ONLY function
// Every write path must go through here.
// logicalDate / logicalWeek ALWAYS come from startAt, never from endAt.
// ------------------------------------------------------------

export function derive(startAt: number, endAt: number | null) {
  return {
    logicalDate: logicalDate(startAt),
    logicalWeek: logicalWeek(startAt),
    durationMin: endAt ? Math.round((endAt - startAt) / MS_MIN) : null,
  };
}

// ------------------------------------------------------------
// Client-side validation - a clear error before the rules throw an
// unclear permission-denied.
// ------------------------------------------------------------

export function assertCategory(c: string): asserts c is Category {
  if (!(CATEGORIES as readonly string[]).includes(c)) {
    throw new ActivityError('bad-category', `Unknown category "${c}"`);
  }
}

export function validateTimes(
  startAt: number,
  endAt: number | null,
  status: ActivityStatus,
  now: number = Date.now()
): void {
  if (!Number.isFinite(startAt)) {
    throw new ActivityError('end-before-start', 'Invalid start time');
  }
  if (endAt !== null) {
    if (endAt <= startAt) {
      throw new ActivityError('end-before-start', 'End time must be after start time');
    }
    if (endAt - startAt > MAX_SESSION_MS) {
      throw new ActivityError('too-long', 'Session cannot exceed 15 hours');
    }
  }
  if (now - startAt > MAX_BACKDATE_MS) {
    throw new ActivityError('too-old', 'Cannot log more than 7 days back');
  }
  if (status !== 'scheduled' && startAt > now + CLOCK_SKEW_MS) {
    throw new ActivityError('future', 'Start time cannot be in the future');
  }
}

/**
 * With endAt = finished. Without endAt = running. THESE TWO GO TOGETHER.
 *
 * Setting endAt but forgetting status is a silent bug: History draws a
 * finished record while Now keeps counting, since it queries `status == 'active'`.
 * 'abandoned' stays - abandoned is abandoned, end time or not.
 */
export function statusForTimes(endAt: number | null, status: ActivityStatus): ActivityStatus {
  if (endAt !== null && (status === 'active' || status === 'scheduled')) return 'done';
  if (endAt === null && status === 'done') return 'active';
  return status;
}

/**
 * logicalDate for a given time zone. The server runs in UTC, so code there
 * must not use device-local getters (logicalDate) for the 04:00 cut.
 */
export function logicalDateInZone(ts: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  if (get('hour') < DAY_CUTOFF_HOUR) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** derive() for server code: the day cut follows `timeZone`, not the server clock. */
export function deriveInZone(startAt: number, endAt: number | null, timeZone: string) {
  const day = logicalDateInZone(startAt, timeZone);
  return {
    logicalDate: day,
    logicalWeek: isoWeekOf(day),
    durationMin: endAt ? Math.round((endAt - startAt) / 60_000) : null,
  };
}
