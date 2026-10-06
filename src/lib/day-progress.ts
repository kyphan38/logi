// ---------------------------------------------------------------------------
// logi - Today's progress on each category button (AMENDMENT-remove-sleep 6b)
//
// The button itself is the gauge. Each has a thin strip at the bottom edge:
// today's hours against THAT day's target.
//
// The target is NOT pro-rated by hour. 9 am and 10 pm must show the same
// denominator, or one cell means two things on two reads.
//
// Pure file: no React, no Firestore, no DOM.
// ---------------------------------------------------------------------------
import { dailyTargetFor, gaugeShape } from '@/lib/day-target';
import { actualHours } from '@/lib/balance';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

export interface NowTile {
  category: Category;
  /** Hours logged today (running sessions count up to `now`). */
  actual: number;
  /** The target for that exact weekday. 0 = no target that day. */
  target: number;
  /** 0..1, never above 1. */
  fill: number;
  /** Over target → full strip + a strong segment at the right edge. */
  over: boolean;
  /** No target (e.g. Work on Sunday) → no strip drawn. */
  noTarget: boolean;
  /**
   * `1.5 / 3.0h today`, or `0.0 / - today` when that day has no target.
   *
   * "today" is there on purpose: the banner shows the WEEK's number with the
   * same category name, so a button without "today" gives two disagreeing
   * numbers with no label to tell them apart.
   */
  label: string;
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * @param weekly the weekly target in effect. Missing (old data) → every button
 *   is `noTarget`: no strip beats a wrong strip.
 * @param weekday 0 = Sun … 6 = Sat, from `logicalWeekday()`
 */
export function nowTiles(
  activities: Activity[],
  weekly: Record<Category, number> | null,
  weekday: number,
  now: number = Date.now()
): NowTile[] {
  const actual = actualHours(activities, now);
  const target = weekly ? dailyTargetFor(weekday, weekly) : null;

  return CATEGORIES.map((c) => {
    const a = actual[c] ?? 0;
    const t = target ? target[c] : 0;
    const { fill, over, noTarget } = gaugeShape(a, t);
    return {
      category: c,
      actual: a,
      target: t,
      fill,
      over,
      noTarget,
      label: noTarget ? `${h1(a)} / - today` : `${h1(a)} / ${h1(t)}h today`,
    };
  });
}
