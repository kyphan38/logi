'use client';

// Data for the Year tab (G5). Read once per year, kept for the session:
// a past year never changes, and this year changes little within a visit.

import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { firstActivityDate, listByRange } from '@/lib/activities';
import { listDayLogs } from '@/lib/bedtime-store';
import { yearRange } from '@/lib/year-summary';
import type { Activity, DayLog } from '@/types/logi';

interface YearData {
  activities: Activity[];
  dayLogs: DayLog[];
}

export function useFirstDate(): string | null | undefined {
  const { uid } = useAuth();
  const [first, setFirst] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    firstActivityDate(uid)
      .then((d) => alive && setFirst(d))
      .catch(() => alive && setFirst(null));
    return () => {
      alive = false;
    };
  }, [uid]);
  return first;
}

export function useYearData(year: string, now: number) {
  const { uid } = useAuth();
  const cache = useRef(new Map<string, YearData>());
  const [data, setData] = useState<{ key: string; value: YearData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = uid ? `${uid}|${year}` : null;

  useEffect(() => {
    if (!uid || !key) return;
    const hit = cache.current.get(key);
    if (hit) {
      setData({ key, value: hit });
      return;
    }
    let alive = true;
    setError(null);
    const range = yearRange(year, now);
    Promise.all([listByRange(uid, range), listDayLogs(uid, range.from, range.to)])
      .then(([activities, dayLogs]) => {
        if (!alive) return;
        const value = { activities, dayLogs };
        cache.current.set(key, value);
        setData({ key, value });
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load the year.'));
    return () => {
      alive = false;
    };
    // `now` only sets the end of this year; a new key is enough to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key, year]);

  const fresh = data && data.key === key ? data.value : null;
  return { data: fresh, loading: !fresh && !error, error };
}
