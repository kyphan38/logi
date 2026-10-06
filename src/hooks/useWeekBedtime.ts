'use client';

// ---------------------------------------------------------------------------
// logi - Bedtime marks for ONE short range (Week tab)
//
// One `getDocs`, no listener: 7 past nights do not change, so a listener pays
// for realtime on something still. Same reason as `useTrend`.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listDayLogs } from '@/lib/bedtime-store';
import type { DayLog } from '@/types/logi';

const EMPTY: DayLog[] = [];

export function useWeekBedtime(from: string, to: string): { logs: DayLog[]; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [logs, setLogs] = useState<DayLog[]>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void (async () => {
      // Inside the async callback, not the effect body: eslint
      // `set-state-in-effect` forbids sync setState in the effect body since it
      // causes cascading renders. In the callback it only runs once the fetch starts.
      if (alive) setLoading(true);
      try {
        const out = await listDayLogs(uid, from, to);
        if (alive) setLogs(out);
      } catch {
        // The card shows its own empty state. An error in a side box should not swallow the page.
        if (alive) setLogs(EMPTY);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, from, to]);

  return { logs, loading };
}
