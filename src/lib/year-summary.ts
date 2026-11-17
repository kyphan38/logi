// Year view for Analytics (G5). Pure: no React, no Firebase.

import { actualHours, logicalDate } from '@/lib/balance';
import { bedtimeStats, formatScale } from '@/lib/bedtime';
import { daysBetween } from '@/lib/range';
import { CATEGORIES, type Activity, type Category, type DayLog } from '@/types/logi';

export interface MonthRow {
  /** "2026-03" */
  month: string;
  hours: Record<Category, number>;
  total: number;
  /** The month has started (false for the rest of this year). */
  started: boolean;
}

export interface YearSummary {
  year: string;
  from: string;
  to: string;
  totals: Record<Category, number>;
  /** Hours per week: total / (days so far / 7). */
  weekly: Record<Category, number>;
  /** "23:10", the median like the other bedtime cards, or null with no nights. */
  bedtime: string | null;
  nights: number;
  months: MonthRow[];
  best: string | null;
  worst: string | null;
}

/** Jan 1 to Dec 31, or to today for the current year. */
export function yearRange(year: string, now: number): { from: string; to: string } {
  const today = logicalDate(now);
  const end = `${year}-12-31`;
  return { from: `${year}-01-01`, to: today < end ? today : end };
}

/** Years from the first record to this year, newest first. */
export function yearChoices(firstDate: string | null, now: number): string[] {
  const current = Number(logicalDate(now).slice(0, 4));
  const first = firstDate ? Math.min(current, Number(firstDate.slice(0, 4))) : current;
  const out: string[] = [];
  for (let y = current; y >= first; y--) out.push(String(y));
  return out;
}

const zero = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
const sum = (r: Record<Category, number>) => CATEGORIES.reduce((t, c) => t + r[c], 0);

export function yearSummary(year: string, activities: Activity[], dayLogs: DayLog[], now: number): YearSummary {
  const { from, to } = yearRange(year, now);
  const inYear = activities.filter((a) => a.logicalDate >= from && a.logicalDate <= to);

  const byMonth = new Map<string, Activity[]>();
  for (const a of inYear) {
    const m = a.logicalDate.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), a]);
  }

  const months: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const hours = byMonth.has(month) ? actualHours(byMonth.get(month)!, now) : zero();
    return { month, hours, total: sum(hours), started: `${month}-01` <= to };
  });

  const totals = zero();
  for (const m of months) for (const c of CATEGORIES) totals[c] += m.hours[c];

  const weeks = Math.max(1, daysBetween(from, to) / 7);
  const weekly = zero();
  for (const c of CATEGORIES) weekly[c] = totals[c] / weeks;

  // Best and worst only among months with something logged; one month alone is not a contrast.
  const logged = months.filter((m) => m.started && m.total > 0);
  const sorted = [...logged].sort((a, b) => b.total - a.total);
  const best = sorted.length >= 2 ? sorted[0].month : null;
  const worst = sorted.length >= 2 ? sorted[sorted.length - 1].month : null;

  const marks = dayLogs
    .filter((d) => d.date >= from && d.date <= to && d.bedtimeAt != null)
    .map((d) => d.bedtimeAt as number);
  const stats = bedtimeStats(marks);

  return {
    year,
    from,
    to,
    totals,
    weekly,
    bedtime: stats ? formatScale(stats.median) : null,
    nights: stats?.n ?? 0,
    months,
    best,
    worst,
  };
}

/** "2026-03" → "Mar". */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}
