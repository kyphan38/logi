'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { logicalDate } from '@/lib/balance';
import { EMPTY_LOG, setBedtime as saveBedtime, subscribeDayLog } from '@/lib/bedtime-store';
import type { DayLog } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - The bedtime mark of one logical day (Stage 8)
//
// Bedtime is ONE MARK in dayLogs, not an activity: no target, not in the 89h
// budget, not shown in Balance / By day / When.
// ---------------------------------------------------------------------------

export function useDayLog(date: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [log, setLog] = useState<DayLog>(() => EMPTY_LOG(date ?? ''));
  const [loading, setLoading] = useState(true);

  const key = uid && date ? `${uid}|${date}` : null;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setLog(EMPTY_LOG(date ?? ''));
    setLoading(key !== null);
  }

  useEffect(() => {
    if (!uid || !date) return;
    return subscribeDayLog(uid, date, (l) => {
      setLog(l);
      setLoading(false);
    });
  }, [uid, date]);

  return { log, loading };
}

/** '2026-09-05' → '2026-09-04'. Uses the previous noon to stay clear of the 04:00 cut. */
function prevDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return logicalDate(new Date(y, m - 1, d - 1, 12).getTime());
}

/**
 * Marks for tonight and last night.
 *
 * The "latest time in the past" rule never reaches beyond 24 hours, so every
 * mark the sheet can save lands on exactly one of these two nights - enough to
 * show the state and know the old value before overwriting.
 */
export function useRecentBedtime(date: string | null) {
  const tonight = useDayLog(date);
  const lastNight = useDayLog(date ? prevDate(date) : null);
  return {
    tonight: tonight.log,
    lastNight: lastNight.log,
    loading: tonight.loading || lastNight.loading,
  };
}

/** Logs "going to bed now". Returns the logical day of the mark (past 00:00 it is the day before). */
export async function logBedtime(uid: string, at: number): Promise<string> {
  return saveBedtime(uid, at);
}

/** The logical day of a bedtime mark - so the toast says which night it went to. */
export function bedtimeDate(at: number): string {
  return logicalDate(at);
}
