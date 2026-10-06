// ============================================================
// logi - Picks ONE line for the balance banner.
//
// Pure file, no React → testable with `node --test`.
//
// The key rule: at most one line. Three warnings at once is the fastest way
// to teach the user to ignore all three.
// ============================================================

import {
  actualHours,
  deviations,
  expectedHours,
  logicalWeekday,
  weekendConflict,
} from '@/lib/balance';
import type { Deviation } from '@/lib/balance';
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

export interface BannerLine {
  /** 'conflict' = weekend OT eating Learn. Highest priority.
   *  'sparse'   = an almost empty week, not enough data to compare. */
  kind: 'conflict' | 'over' | 'under' | 'sparse';
  text: string;
  category: Category | null;
  deltaHours: number;
}

/**
 * Below this, every category reads -99% and the banner only discourages
 * without informing. Early week or a week back from leave both land here.
 */
export const MIN_LOGGED_RATIO = 0.2;

/**
 * How much has been logged versus what should exist BY NOW.
 *
 * The denominator is the user's own target, not 24h/day - so it still means
 * something after Sleep was removed, unlike the deleted fixed 168h divide (section 3.2).
 */
export function loggedRatio(
  activities: Activity[],
  weekly: Record<Category, number>,
  now: number = Date.now()
): number {
  const exp = expectedHours(weekly, now);
  const act = actualHours(activities, now);
  const total = CATEGORIES.reduce((a, c) => a + exp[c], 0);
  if (total <= 0) return 1; // nothing due yet → do not hide the banner for that
  return CATEGORIES.reduce((a, c) => a + (act[c] ?? 0), 0) / total;
}

/**
 * `Work 0.4h · 31.0h expected by now this week (-99%)`
 *
 * Does NOT use `balance.ts`'s `formatDeviation()`: it writes `0.4h / 31.0h`,
 * and the `/` makes 31.0h read like Work's weekly target - while the Targets
 * screen says 40h.
 *
 * "this week" is there on purpose: the button on Now shows TODAY's number with
 * the same category name, so a banner without "this week" gives two
 * disagreeing numbers with no label to tell them apart (Stage 8 section 7).
 */
function phrase(d: Deviation): string {
  const label = CATEGORY_LABEL[d.category];
  const sign = d.deltaHours > 0 ? '+' : '';
  const pct = Math.round(d.deltaPct * 100);
  return `${label} ${d.actual.toFixed(1)}h · ${d.expected.toFixed(1)}h expected by now this week (${sign}${pct}%)`;
}

/** `Weekend OT: 8.0h. Learn is 12.0h short of its 31h weekly target.` */
function conflictPhrase(
  activities: Activity[],
  weekly: Record<Category, number>,
  now: number
): string {
  const weekend = activities.filter((a) => [0, 6].includes(logicalWeekday(a.startAt)));
  const otWork = actualHours(weekend, now).work;
  const gap = weekly.learn - actualHours(activities, now).learn;
  return `Weekend OT: ${otWork.toFixed(1)}h. Learn is ${gap.toFixed(1)}h short of its ${weekly.learn}h weekly target.`;
}

/**
 * `null` = hide the banner entirely. Deliberately no "you're on track" state:
 * a daily line of praise trains the eye to skip that spot on the screen, and
 * on a day with a real warning nobody reads it either.
 */
export function pickBalance(
  activities: Activity[],
  weekly: Record<Category, number> | null,
  now: number = Date.now()
): BannerLine | null {
  if (!weekly) return null;

  // An almost empty week: say plainly there is not enough data, never fire -99%
  // at the user. Checked BEFORE conflict, since conflict means nothing when empty.
  if (loggedRatio(activities, weekly, now) < MIN_LOGGED_RATIO) {
    return {
      kind: 'sparse',
      text: 'Not enough logged this week to compare.',
      category: null,
      deltaHours: 0,
    };
  }

  // Conflict beats everything: it links two categories, so it says more than
  // any single gap.
  // The RULE still lives in balance.ts; this only words the sentence.
  if (weekendConflict(activities, weekly, now)) {
    return {
      kind: 'conflict',
      text: conflictPhrase(activities, weekly, now),
      category: null,
      deltaHours: 0,
    };
  }

  // `deviations()` calls `expectedHours()` - pro-rated BY CALENDAR, summing
  // each past day's target. Never `weekly × days/7`.
  const bad = deviations(activities, weekly, now).filter((d) => d.flag !== 'ok');
  if (bad.length === 0) return null;

  let worst = bad[0];
  for (const d of bad) {
    if (Math.abs(d.deltaHours) > Math.abs(worst.deltaHours)) worst = d;
  }

  return {
    kind: worst.flag === 'over' ? 'over' : 'under',
    text: phrase(worst),
    category: worst.category,
    deltaHours: worst.deltaHours,
  };
}
