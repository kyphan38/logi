// ---------------------------------------------------------------------------
// logi - The DONE / TARGET / LEFT|DIFF table follows the range (AMENDMENT section 8.2)
//
// The old table always showed TODAY's numbers whatever range was picked -
// "Last week" picked, and the table still told today's story. Now it follows
// the range, and the third column's meaning depends on whether the range is closed:
//
//   - Range NOT over → `LEFT` = max(0, target − done). Time left to finish.
//   - Range closed   → `DIFF` = done − target, signed. Asking "how many hours
//     left" for a past week makes no sense.
//
// The target covers the WHOLE period, not pro-rated: "Hours left this week" must
// subtract from seven days' target, not just the days so far.
//
// Pure file: no React, no Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { addDays } from '@/lib/timeline';
import { chipLabel, mondayOf, rangeLabel, type Range } from '@/lib/range';
import { actualForRange, expectedForRange } from '@/lib/range-target';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

/** `left` for a range still running, `diff` for a closed one. */
export type TailKind = 'left' | 'diff';

export interface RangeTableRow {
  category: Category;
  done: number;
  target: number;
  /** `LEFT` (never negative) or `DIFF` (signed), depending on `tail`. */
  tail: number;
}

export interface RangeTable {
  title: string;
  tail: TailKind;
  /** The third column's label, already uppercased for the UI. */
  tailLabel: string;
  note: string;
  rows: RangeTableRow[];
}

/**
 * The whole period the range stands for.
 *
 * `this_week` stops at today so the chart does not report false shortfalls,
 * but the target must cover all seven days. Same for `this_month`.
 */
export function fullPeriod(range: Range): Range {
  const closed = (from: string, to: string): Range => ({
    from,
    to,
    kind: range.kind,
    isPartial: false,
  });

  switch (range.kind) {
    case 'this_week': {
      const from = mondayOf(range.from);
      return closed(from, addDays(from, 6));
    }
    case 'this_month': {
      const from = `${range.from.slice(0, 7)}-01`;
      const [y, m] = from.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return closed(from, `${from.slice(0, 7)}-${String(last).padStart(2, '0')}`);
    }
    default:
      return closed(range.from, range.to);
  }
}

/** Is the period still running? Only then can "how much is left" be asked. */
export function isOpenPeriod(range: Range, now: number = Date.now()): boolean {
  return fullPeriod(range).to >= logicalDate(now);
}

function noteFor(range: Range, open: boolean): string {
  switch (range.kind) {
    case 'this_week':
      return 'Hours left this week.';
    case 'this_month':
      return 'Hours left this month.';
    case 'last_week':
      return 'Final numbers for the week.';
    default:
      return open ? 'Hours left in this period.' : 'Final numbers for this period.';
  }
}

export function rangeTable(
  activities: Activity[],
  range: Range,
  weekTargets: Map<string, Record<Category, number>>,
  now: number = Date.now()
): RangeTable {
  const open = isOpenPeriod(range, now);
  const done = actualForRange(activities, range, now);
  const target = expectedForRange(fullPeriod(range), weekTargets, now);

  const rows: RangeTableRow[] = [];
  for (const c of CATEGORIES) {
    const d = done[c];
    const t = target[c];
    // Only hidden when both are 0 (e.g. Work on a single Sunday). Otherwise
    // always shown in full, to compare across categories.
    if (d === 0 && t === 0) continue;
    rows.push({ category: c, done: d, target: t, tail: open ? Math.max(0, t - d) : d - t });
  }

  return {
    title: range.kind === 'custom' ? rangeLabel(range) : chipLabel(range.kind),
    tail: open ? 'left' : 'diff',
    tailLabel: open ? 'Left' : 'Diff',
    note: noteFor(range, open),
    rows,
  };
}
