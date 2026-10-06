// ============================================================
// logi - Backup & restore (Stage 6 Task 3)
//
// After a year this data cannot be recreated, and Firestore's free tier has
// NO automatic backup. This file does two things:
//   1. Remind to export at the right time, without nagging
//   2. Read an exported JSON file and build an ADD-ONLY restore plan
//
// Pure: no React, no Firestore. Tested with `node --test`.
// ============================================================

import { logicalDate, logicalWeekday } from '@/lib/balance';
import type { JsonExport } from '@/lib/export';
import { daysBetween } from '@/lib/range';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

// ------------------------------------------------------------
// Export reminder
// ------------------------------------------------------------

/** Never exported and already this many days of data → remind at once. */
export const FIRST_NUDGE_DAYS = 30;

export interface ExportNudge {
  show: boolean;
  text: string;
  /** Days since the last export; null = never. */
  daysAgo: number | null;
}

const NO_NUDGE: ExportNudge = { show: false, text: '', daysAgo: null };

/**
 * Days ELAPSED between two logical days.
 * range.ts's `daysBetween()` counts both ends (same day = 1), for range
 * length. Here the difference is needed, so subtract one.
 */
function daysAgoOf(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to) - 1);
}

/** The first Sunday of the month. */
function isFirstSunday(now: number): boolean {
  if (logicalWeekday(now) !== 0) return false;
  const day = Number(logicalDate(now).slice(8, 10));
  return day <= 7;
}

/**
 * Reminds on the first Sunday of each month, plus once for someone who has
 * never exported but has over a month of data.
 *
 * Deliberately NOT daily: nagging teaches people to ignore it, and the time a
 * reminder really matters gets ignored too.
 */
export function exportNudge(input: {
  lastExport: number | null;
  /** logicalDate of the oldest record, null with no data. */
  firstRecord: string | null;
  now: number;
}): ExportNudge {
  const { lastExport, firstRecord, now } = input;
  const today = logicalDate(now);

  // Never exported but over a month of data → remind now, without waiting
  // for the first Sunday. This is the riskiest group.
  if (lastExport === null) {
    if (!firstRecord) return NO_NUDGE;
    if (daysAgoOf(firstRecord, today) < FIRST_NUDGE_DAYS) return NO_NUDGE;
    return { show: true, text: 'Never exported. Back up your data.', daysAgo: null };
  }

  const days = daysAgoOf(logicalDate(lastExport), today);
  if (!isFirstSunday(now)) return NO_NUDGE;
  return {
    show: true,
    text: `Last export: ${days} ${days === 1 ? 'day' : 'days'} ago`,
    daysAgo: days,
  };
}

// ------------------------------------------------------------
// Reading the backup file
// ------------------------------------------------------------

export interface BackupFile extends JsonExport {
  /** The debt ledger at export time. May be missing in old files. */
  debt?: Partial<Record<Category, number>>;
}

export interface ParseResult {
  file: BackupFile | null;
  error: string | null;
}

function isActivity(v: unknown): v is Activity {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    typeof a.category === 'string' &&
    typeof a.startAt === 'number' &&
    typeof a.logicalDate === 'string'
  );
}

/**
 * Picky on purpose. This file goes straight into the database,
 * so rejecting an odd file beats accepting junk that cannot be fixed.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { file: null, error: 'Not a valid JSON file.' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { file: null, error: 'Not a logi backup file.' };
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.activities)) {
    return { file: null, error: 'No activities in this file. Is it the CSV export?' };
  }

  const activities = o.activities.filter(isActivity);
  if (activities.length === 0) {
    return { file: null, error: 'No readable records in this file.' };
  }

  const weekTargets = Array.isArray(o.weekTargets)
    ? (o.weekTargets as BackupFile['weekTargets'])
    : [];

  return {
    file: {
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      range: (o.range as BackupFile['range']) ?? { from: '', to: '' },
      weekTargets,
      activities,
      debt: (o.debt as BackupFile['debt']) ?? undefined,
    },
    error: null,
  };
}

// ------------------------------------------------------------
// Restore plan
// ------------------------------------------------------------

export interface RestorePreview {
  records: number;
  weeks: number;
  from: string;
  to: string;
  targets: number;
}

export function previewBackup(file: BackupFile): RestorePreview {
  const dates = file.activities.map((a) => a.logicalDate).sort();
  const weeks = new Set(file.activities.map((a) => a.logicalWeek));
  return {
    records: file.activities.length,
    weeks: weeks.size,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    targets: file.weekTargets.length,
  };
}

export interface RestorePlan {
  /** Records to be added. */
  add: Activity[];
  /** Already present - skipped, NEVER overwritten. */
  skip: number;
  /**
   * Records in a retired category - skipped.
   * Old export files still hold 'sleep'. Without this filter Restore would
   * rebuild exactly what was deleted, the Firestore rules would block it, and
   * the user would only see a silent error.
   */
  retired: number;
}

/**
 * Add only, never overwrite or delete.
 *
 * Import is done by someone panicking over lost data. Overwriting here means
 * one mistap turns correct data into older data.
 */
export function planRestore(file: BackupFile, existingIds: ReadonlySet<string>): RestorePlan {
  const add: Activity[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let retired = 0;

  for (const a of file.activities) {
    if (!(CATEGORIES as readonly string[]).includes(a.category)) {
      retired++;
      continue;
    }
    if (existingIds.has(a.id) || seen.has(a.id)) {
      skip++;
      continue;
    }
    seen.add(a.id);
    add.push(a);
  }
  return { add, skip, retired };
}

/** Only runs when this exact word is typed. */
export const RESTORE_WORD = 'RESTORE';
