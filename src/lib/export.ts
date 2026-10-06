// ---------------------------------------------------------------------------
// logi - Export CSV / JSON (Stage 5 Task 7)
//
// The data belongs to the user. Exporting means never being locked into the app.
//
// Pure file: no React, no Firestore, no DOM.
// ---------------------------------------------------------------------------
import type { Range } from '@/lib/range';
import type { Activity, Category } from '@/types/logi';

/** Column order is a contract - changing it breaks other people's scripts. */
export const CSV_COLUMNS = [
  'id',
  'category',
  'label',
  'start',
  'end',
  'durationMin',
  'logicalDate',
  'logicalWeek',
  'status',
  'source',
] as const;

/**
 * Excel on Windows reads CSV in the system code page, so Vietnamese becomes
 * garbage. Three BOM bytes at the start tell it "this is UTF-8".
 */
export const BOM = '﻿';

/**
 * Quotes a field per RFC 4180.
 *
 * `label` comes from voice ("worked on devops, then lunch"), so commas are
 * normal, not a rare exception.
 */
export function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * epoch ms → "2026-08-26T09:30:00+07:00".
 *
 * LOCAL time with offset, not UTC: opening the file must show the hours you
 * actually lived, not hours 7 hours off.
 */
export function isoWithOffset(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

  // getTimezoneOffset() returns the MINUTES to add to get UTC → the sign is reversed.
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';

  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  );
}

export function toCsv(activities: Activity[]): string {
  const lines = [CSV_COLUMNS.join(',')];

  for (const a of activities) {
    lines.push(
      [
        csvField(a.id),
        csvField(a.category),
        csvField(a.label),
        csvField(isoWithOffset(a.startAt)),
        // A running session has no end yet - leave it empty instead of inventing `now`.
        csvField(a.endAt === null ? '' : isoWithOffset(a.endAt)),
        csvField(a.durationMin),
        csvField(a.logicalDate),
        csvField(a.logicalWeek),
        csvField(a.status),
        csvField(a.source),
      ].join(',')
    );
  }

  // CRLF per RFC 4180; old Excel on Windows needs exactly this pair.
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * The date the 'sleep' category was retired (AMENDMENT-remove-sleep section 4.4).
 * OLD export files from before this date are the only copy of sleep history.
 */
export const SLEEP_RETIRED_ON = '2026-08-29';

export interface JsonExport {
  exportedAt: string;
  /**
   * Why new files no longer contain any 'sleep' record.
   * Optional: OLD export files lack this field, and Restore must still read them.
   */
  note?: string;
  range: { from: string; to: string };
  weekTargets: { week: string; weekly: Record<Category, number> }[];
  activities: Activity[];
  /**
   * The debt ledger at export time. Only in the "All time" export: a file for a
   * date range cannot describe that range's ledger, and including it would mislead.
   */
  debt?: Partial<Record<Category, number>>;
}

/**
 * Includes `weekTargets`, not just activities: without targets, analysis
 * outside the app cannot rebuild "how far off the plan it was".
 */
export function toJson(
  activities: Activity[],
  range: Range,
  weekTargets: Map<string, Record<Category, number>>,
  now: number = Date.now(),
  debt?: Partial<Record<Category, number>>
): string {
  const out: JsonExport = {
    exportedAt: isoWithOffset(now),
    note: `sleep category was retired on ${SLEEP_RETIRED_ON}`,
    range: { from: range.from, to: range.to },
    weekTargets: [...weekTargets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, weekly]) => ({ week, weekly })),
    activities,
    ...(debt ? { debt } : {}),
  };
  return JSON.stringify(out, null, 2);
}

/** "logi-2026-08-01_2026-08-31.csv" */
export function exportFilename(range: { from: string; to: string }, ext: 'csv' | 'json'): string {
  return range.from === range.to
    ? `logi-${range.from}.${ext}`
    : `logi-${range.from}_${range.to}.${ext}`;
}
