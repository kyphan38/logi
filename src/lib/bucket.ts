// ---------------------------------------------------------------------------
// logi - Grouping a range into stacked bar columns (Stage 5 Task 4)
//
// 30 columns on a 375px screen are unreadable: labels overlap, each column
// is 5px wide. So the rule is fixed:
//   ≤ 14 days  → 1 column / day
//   > 14 days  → 1 column / logical week
//
// Pure file: no React, no Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { daysBetween, daysOf, weekOf, weekdayOf, type Range } from '@/lib/range';
import { weekLabel } from '@/lib/week';

/** Beyond this threshold, switch to weekly grouping. */
export const MAX_DAY_COLUMNS = 14;

export type BucketMode = 'day' | 'week';

export interface Bucket {
  /** A stable key for React and Recharts. */
  key: string;
  /** X-axis label: "Mon 24" or "W35". */
  label: string;
  /** The sub-range, reusable with `actualForRange` / `expectedForRange`. */
  range: Range;
  /** Logical days really in the column (weeks at either end may be cut). */
  days: number;
}

export function bucketMode(range: { from: string; to: string }): BucketMode {
  return daysBetween(range.from, range.to) <= MAX_DAY_COLUMNS ? 'day' : 'week';
}

/**
 * Splits a range into columns. Weeks at either end are cut at the range edge -
 * never extended beyond it, or the first column would look falsely low against
 * a full week's target.
 */
export function bucketsOf(range: Range, now: number = Date.now()): Bucket[] {
  const days = daysOf(range);
  const today = logicalDate(now);
  const mode = bucketMode(range);

  const sub = (from: string, to: string): Range => ({
    from,
    to,
    kind: 'custom',
    // Only the column holding today is unfinished, and only if the whole range is.
    isPartial: range.isPartial && from <= today && today <= to,
  });

  if (mode === 'day') {
    return days.map((d) => ({
      key: d,
      label: dayLabel(d),
      range: sub(d, d),
      days: 1,
    }));
  }

  const out: Bucket[] = [];
  for (const d of days) {
    const w = weekOf(d);
    const last = out[out.length - 1];
    if (last && last.key === w) {
      last.range = { ...last.range, to: d, isPartial: sub(last.range.from, d).isPartial };
      last.days += 1;
    } else {
      out.push({ key: w, label: weekLabel(w), range: sub(d, d), days: 1 });
    }
  }
  return out;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "2026-08-24" → "Mon 24".
 *
 * Built by hand, not `toLocaleDateString`: the device locale decides the order
 * ("24 Mon" in many places), but the X axis must be the same on every device.
 */
export function dayLabel(date: string): string {
  const [, , d] = date.split('-').map(Number);
  return `${DOW[weekdayOf(date)]} ${d}`;
}
