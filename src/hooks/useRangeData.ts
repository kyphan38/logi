'use client';

// ---------------------------------------------------------------------------
// logi - Data for the Analytics screen (Stage 5)
//
// One range → ONE activities query + ONE weekTargets query. Never a query
// loop per day.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { subscribeByRange } from '@/lib/activities';
import { weeksOf, type Range } from '@/lib/range';
import { fullPeriod } from '@/lib/range-table';
import { subscribeWeekTargets } from '@/lib/targets';
import { PRESETS, type Activity, type Category, type WeekTarget } from '@/types/logi';

const EMPTY: Activity[] = [];

export interface RangeData {
  activities: Activity[];
  /** logicalWeek → that week's target. A week with no doc falls back to PRESETS.normal. */
  weekTargets: Map<string, Record<Category, number>>;
  /** Weeks whose target changed after 21:00 Sunday - the chart must say so, not hide it. */
  lateWeeks: Set<string>;
  loading: boolean;
  error: string | null;
  /** Rebuild both queries. For the Retry button on a flaky network. */
  reload: () => void;
}

export function useRangeData(range: Range): RangeData {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [weekTargets, setWeekTargets] = useState<Map<string, Record<Category, number>>>(
    () => new Map()
  );
  const [lateWeeks, setLateWeeks] = useState<Set<string>>(() => new Set());
  const [loadingActs, setLoadingActs] = useState(true);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const { from, to, kind } = range;

  // Range changed → clear old numbers at once. Otherwise the chart shows the old
  // range's numbers under the new range's labels for one render.
  const key = uid ? `${uid}|${from}|${to}|${kind}|${nonce}` : null;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setActivities(EMPTY);
    setWeekTargets(new Map());
    setLateWeeks(new Set());
    setError(null);
    setLoadingActs(key !== null);
    setLoadingTargets(key !== null);
  }

  useEffect(() => {
    if (!uid) return;
    void nonce; // Retry: a new nonce reruns both effects.
    return subscribeByRange(
      uid,
      { from, to },
      (list) => {
        setActivities(list);
        setLoadingActs(false);
        setError(null);
      },
      (e) => {
        setError((e as Error).message);
        setLoadingActs(false);
      }
    );
  }, [uid, from, to, nonce]);

  useEffect(() => {
    if (!uid) return;
    void nonce;
    // Fetch enough weeks for both the range and fullPeriod (RangeTable covers the whole month)
    const period = fullPeriod(range);
    const weeks = weeksOf(period);

    return subscribeWeekTargets(
      uid,
      weeks,
      (map) => {
        const out = new Map<string, Record<Category, number>>();
        const late = new Set<string>();
        for (const w of weeks) {
          const wt = map.get(w);
          out.set(w, weeklyOf(wt));
          if (wt?.lateChange) late.add(w);
        }
        setWeekTargets(out);
        setLateWeeks(late);
        setLoadingTargets(false);
      },
      (e: unknown) => {
        // Without targets the chart can still draw "actual"; do not block the page.
        const out = new Map<string, Record<Category, number>>();
        for (const w of weeks) out.set(w, PRESETS.normal.weekly);
        setWeekTargets(out);
        setLoadingTargets(false);
        setError((e as Error).message);
      }
    );
  }, [uid, from, to, kind, nonce]);

  return {
    activities,
    weekTargets,
    lateWeeks,
    loading: loadingActs || loadingTargets,
    error,
    reload: () => setNonce((n) => n + 1),
  };
}

function weeklyOf(wt: WeekTarget | undefined): Record<Category, number> {
  return wt ? wt.weekly : PRESETS.normal.weekly;
}
