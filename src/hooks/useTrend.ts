'use client';

// ---------------------------------------------------------------------------
// logi - Data for the Trend box
//
// Read ONCE (`getDocs`), no listener: 6 months of data is thousands of docs,
// and April's numbers never change again. A listener here pays for realtime
// on something that never moves.
//
// A shorter span (6 weeks ⊂ 6 months) is still reread: different ranges get
// their own cache entry, kept for the session so switching back is free.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listByRange } from '@/lib/activities';
import { listDayLogs } from '@/lib/bedtime-store';
import { weeksOf } from '@/lib/range';
import { listWeekTargets } from '@/lib/targets';
import { trendBuckets, trendWindow, type TrendSpan } from '@/lib/trend';
import type { Activity, Category, DayLog } from '@/types/logi';

export interface TrendData {
  activities: Activity[];
  weekTargets: Map<string, Record<Category, number>>;
  /** Bedtime marks in the window. */
  dayLogs: DayLog[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY: Activity[] = [];
const EMPTY_TARGETS = new Map<string, Record<Category, number>>();
const EMPTY_LOGS: DayLog[] = [];

interface Cached {
  /** The range these numbers belong to. Without it, "6 weeks" bars sit under a "6 months" label. */
  key: string;
  activities: Activity[];
  weekTargets: Map<string, Record<Category, number>>;
  dayLogs: DayLog[];
}

// Fetch all three sources in ONE go. The Trend tab shows both cards at once, so
// splitting by `extra` would read activities three times under three cache
// keys. 26 weeks is still one query on `logicalDate`, not 26 queries.
export function useTrend(span: TrendSpan, now: number): TrendData {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const buckets = trendBuckets(span, now);
  const win = trendWindow(buckets);
  const key = uid ? `${uid}|${win.from}|${win.to}` : null;

  const cache = useRef(new Map<string, Cached>());
  const [data, setData] = useState<Cached | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Old numbers are only used when they really belong to the viewed range.
  const fresh = data && data.key === key ? data : null;

  useEffect(() => {
    if (!key || !uid) return;

    // Switching between spans already seen: take from cache, no new query.
    const hit = cache.current.get(key);
    if (hit) {
      setData(hit);
      setError(null);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        // Parallel queries: activities for the whole window + targets for every
        // week it touches + bedtime. Never a query loop per column.
        const [activities, targetDocs, dayLogs] = await Promise.all([
          listByRange(uid, win),
          listWeekTargets(uid, weeksOf(win)),
          listDayLogs(uid, win.from, win.to),
        ]);
        if (!alive) return;

        const weekTargets = new Map<string, Record<Category, number>>();
        for (const [w, t] of targetDocs) weekTargets.set(w, t.weekly);

        const next = { key, activities, weekTargets, dayLogs };
        cache.current.set(key, next);
        setData(next);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load trend.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // `win` is rebuilt every render, but its content is fully captured in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid, nonce]);

  return {
    activities: fresh?.activities ?? EMPTY,
    weekTargets: fresh?.weekTargets ?? EMPTY_TARGETS,
    dayLogs: fresh?.dayLogs ?? EMPTY_LOGS,
    loading: !fresh && (loading || error === null),
    error,
    reload: () => {
      if (key) cache.current.delete(key);
      setNonce((n) => n + 1);
    },
  };
}
