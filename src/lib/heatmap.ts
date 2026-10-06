// ---------------------------------------------------------------------------
// logi - 24h × day heatmap (Stage 5 Task 5, revised by AMENDMENT sleep-boundary)
//
// Answers "WHEN", not "HOW MUCH" - how much is already in the balance bars.
//
// Column = CALENDAR day, row = REAL clock hour (00:00 → 23:00). A cell is
// filled by when the thing really happened, whatever `logicalDate` the record
// has: sleep 00:15 → 07:30 Tuesday fills Tuesday's 00:00–07:00 cells.
//
// So the heatmap and category totals do NOT match on late-sleep days. That is
// right: totals use logical days (04:00 cut), the heatmap uses clock time.
// Two different questions.
//
// Rows do NOT stretch like the History timeline: every hour must be the same
// height for the eye to compare "8 am today" with "8 am yesterday".
//
// Pure file: no React, no Firestore.
// ---------------------------------------------------------------------------
import { daysBetween, daysOf, type Range } from '@/lib/range';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

/** Beyond 14 days cells get narrower than 3px - pointless. */
export const MAX_HEATMAP_DAYS = 14;

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

/** "2026-08-25" → 00:00 local time. */
function startOfCalendarDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Date → "2026-08-25" (calendar day, not logical day). */
function dayKey(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface Cell {
  /** The category with the most minutes in that hour. null = nothing logged. */
  category: Category | null;
  /** Minutes logged by the winning category, 0..60. */
  minutes: number;
}

export interface Heatmap {
  /** CALENDAR days, in column order left → right. */
  days: string[];
  /** Row labels: "00:00" … "23:00". */
  hours: string[];
  /** grid[row][column] - row 0 is 00:00. */
  grid: Cell[][];
}

export function heatmapFits(range: { from: string; to: string }): boolean {
  return daysBetween(range.from, range.to) <= MAX_HEATMAP_DAYS;
}

export function heatmapOf(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): Heatmap {
  const days = daysOf(range);
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  // Minutes per category per cell, before picking the winner.
  const acc: Record<Category, number>[][] = Array.from({ length: 24 }, () =>
    days.map(() => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>)
  );

  const colOf = new Map(days.map((d, i) => [d, i]));
  // The last column closes at 24:00 of that calendar day, not 04:00 the next day.
  const limit = Math.min(startOfCalendarDay(days[days.length - 1]) + 24 * HOUR_MS, now);
  const first = startOfCalendarDay(days[0]);

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;

    const from = Math.max(a.startAt, first);
    const to = Math.min(a.endAt ?? now, limit);
    if (to <= from) continue;

    // Walk one clock hour at a time - crossing midnight is normal, it just
    // moves to the next column.
    let t = from;
    while (t < to) {
      const d = new Date(t);
      const cellStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
      const cellEnd = cellStart + HOUR_MS;
      const col = colOf.get(dayKey(d));
      if (col !== undefined) {
        const overlap = Math.min(to, cellEnd) - t;
        if (overlap > 0) acc[d.getHours()][col][a.category] += overlap / MIN_MS;
      }
      t = cellEnd;
    }
  }

  const grid = acc.map((rowCats) =>
    rowCats.map((cats) => {
      let best: Category | null = null;
      let bestMin = 0;
      for (const c of CATEGORIES) {
        // `>` not `>=`: on a tie keep the first in CATEGORIES order, so the same
        // data always gives the same color.
        if (cats[c] > bestMin) {
          best = c;
          bestMin = cats[c];
        }
      }
      return { category: best, minutes: bestMin };
    })
  );

  return { days, hours, grid };
}
