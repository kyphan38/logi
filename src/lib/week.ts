// ============================================================
// logi - ISO week math ("2026-W35")
// Pure file: no React, no Firestore. Tested with `node --test`.
//
// `logicalWeek()` in balance.ts goes one way: ts → "2026-W35". Stage 4 needs
// the reverse (week → time) to step weeks back/forward and to know when
// 21:00 Sunday is. This file does that, and always goes back through
// `logicalWeek()` to name weeks - never naming them in parallel.
// ============================================================

import { logicalWeek, logicalWeekday } from '@/lib/balance';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const WEEK_RE = /^(\d{4})-W(\d{2})$/;

export function isWeekId(week: string): boolean {
  return WEEK_RE.test(week);
}

/**
 * 12:00 noon Monday (local time) of the week.
 *
 * 12:00 on purpose, not 00:00: the logical day cuts at 04:00, so 00:00 Monday
 * still belongs to Sunday - a whole week off.
 */
export function weekStart(week: string): number {
  const m = WEEK_RE.exec(week);
  if (!m) throw new Error(`Bad week id "${week}"`);
  const year = Number(m[1]);
  const n = Number(m[2]);

  // ISO rule: 4 January is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7; // CN = 7
  const mondayW1 = Date.UTC(year, 0, 4 - (dow - 1));
  const monday = new Date(mondayW1 + (n - 1) * WEEK_MS);

  return new Date(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate(),
    12
  ).getTime();
}

/** "2026-W35" + 1 → "2026-W36". Correct across years since it goes through logicalWeek(). */
export function addWeeks(week: string, n: number): string {
  const d = new Date(weekStart(week));
  d.setDate(d.getDate() + n * 7);
  return logicalWeek(d.getTime());
}

/** Weeks from `from` to `to`. Negative means `to` comes first. */
export function weekDiff(from: string, to: string): number {
  return Math.round((weekStart(to) - weekStart(from)) / WEEK_MS);
}

/**
 * 21:00 Sunday of the week - the closing mark.
 * Sunday is the week's 7th logical day, i.e. Monday + 6 days.
 */
export function weekLockAt(week: string): number {
  const d = new Date(weekStart(week));
  d.setDate(d.getDate() + 6);
  d.setHours(21, 0, 0, 0);
  return d.getTime();
}

/** Whether the week has passed 21:00 Sunday. For the lazy lock on app open. */
export function isWeekClosed(week: string, now: number = Date.now()): boolean {
  return now >= weekLockAt(week);
}

/**
 * Editing the target on Friday / Saturday / Sunday → lateChange.
 * Changing the plan when the week is nearly over is rewriting history, not planning.
 */
export function isLateChange(now: number = Date.now()): boolean {
  const dow = logicalWeekday(now); // 0 = CN ... 6 = T7
  return dow === 5 || dow === 6 || dow === 0;
}

/** "2026-W35" → "W35". A short label for cards. */
export function weekLabel(week: string): string {
  const m = WEEK_RE.exec(week);
  return m ? `W${m[2]}` : week;
}
