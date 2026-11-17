// Day summary (G9): one screen after bedtime. Pure: no React, no Firebase.

import { addDays } from '@/lib/timeline';
import type { NowTile } from '@/lib/day-progress';
import type { RoutineDayGroup } from '@/lib/routine';
import { CATEGORY_LABEL, type Category, type EventItem } from '@/types/logi';

export type SummaryRow = { category: Category; name: string; actual: string; target: string | null; met: boolean };

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** One row per category with hours or a target today; the rest add nothing. */
export function summaryRows(tiles: NowTile[]): SummaryRow[] {
  return tiles
    .filter((t) => t.actual > 0.05 || !t.noTarget)
    .map((t) => ({
      category: t.category,
      name: CATEGORY_LABEL[t.category],
      actual: `${h1(t.actual)}h`,
      target: t.noTarget ? null : `${h1(t.target)}h`,
      met: !t.noTarget && t.actual >= t.target - 0.05,
    }));
}

/** "3 of 5", or null when there is no routine today. */
export function routineLine(groups: RoutineDayGroup[]): string | null {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (total === 0) return null;
  const done = groups.reduce((n, g) => n + g.done, 0);
  return `${done} of ${total}`;
}

/** Events on the next logical day, timed ones first by time, then all-day ones. */
export function tomorrowEvents(events: EventItem[], today: string): EventItem[] {
  const tomorrow = addDays(today, 1);
  return events
    .filter((e) => e.date === tomorrow)
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
}

/** The "today" word on Now shows from 20:00 until the 04:00 day cut. */
export function showsTodayWord(now: number): boolean {
  const h = new Date(now).getHours();
  return h >= 20 || h < 4;
}
