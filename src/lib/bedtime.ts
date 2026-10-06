// ---------------------------------------------------------------------------
// logi - Bedtime (Stage 8)
//
// A light version of the removed Sleep: log ONE MARK, not a span. Avoids all
// the old trouble - start/stop, crossing midnight, splitting blocks, the hour budget.
//
// The whole file turns on ONE idea: bedtimes must be mapped onto a CONTINUOUS
// SCALE before computing a median or spread.
//
//     22:00 → 22.0     00:15 → 24.25     01:30 → 25.5
//
// Without it, the median of 22:00 and 00:15 is 11 am. Those two nights are
// 135 minutes apart, not 22 hours.
//
// Pure file: no React, no Firestore, no DOM.
// ---------------------------------------------------------------------------
import { DAY_CUTOFF_HOUR } from '@/types/logi';

/**
 * Bedtime mark → hours on the logical day's continuous scale.
 *
 * Uses the SAME 04:00 cut as `logicalDate()`: times before 04:00 belong to the
 * previous day's night, so they sit AFTER 24, not at the start of a new day.
 */
export function bedtimeScale(ts: number): number {
  const d = new Date(ts);
  const h = d.getHours() + d.getMinutes() / 60;
  return h < DAY_CUTOFF_HOUR ? h + 24 : h;
}

/** 22.0 → "22:00", 24.25 → "00:15", 25.5 → "01:30". */
export function formatScale(scale: number): string {
  // Round to the minute BEFORE splitting hours/minutes: splitting 23.999h first
  // gives "23:60".
  const totalMin = Math.round(scale * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** epoch → "22:00". A shortcut where only the logged time is shown. */
export function formatBedtime(ts: number): string {
  return formatScale(bedtimeScale(ts));
}

/**
 * Median. Empty array → null.
 *
 * With an even count, average the two middle values, by definition. On the
 * continuous scale above that average is safe - on a 0..24 scale it is not.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface BedtimeStats {
  /** Median on the continuous scale. */
  median: number;
  min: number;
  max: number;
  /** Number of nights logged. */
  n: number;
}

/**
 * Stats for a group of nights. No nights → `null`, NOT 0.
 *
 * Same rule as `sampleSize < 3` in AI insights and empty Trend columns:
 * missing data is not zero data.
 */
export function bedtimeStats(timestamps: number[]): BedtimeStats | null {
  if (timestamps.length === 0) return null;
  const scales = timestamps.map(bedtimeScale);
  return {
    median: median(scales)!,
    min: Math.min(...scales),
    max: Math.max(...scales),
    n: scales.length,
  };
}
