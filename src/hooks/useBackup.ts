'use client';

// ------------------------------------------------------------
// logi - Backup (Stage 6 Task 3)
//
// Firestore's free tier has NO automatic backup. After a year of logging, this
// data cannot be recreated. This hook does two things: fetch all data for
// export, and remind to export when it has been a while.
//
// Everything is a ONE-TIME read, no listener: this is an occasional task, no
// need for realtime and not worth the quota.
// ------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { firstActivityDate, listAll } from '@/lib/activities';
import { exportNudge, type ExportNudge } from '@/lib/backup';
import { getDebt, getLastExport, listAllWeekTargets, markExported } from '@/lib/targets';
import type { Range } from '@/lib/range';
import type { Activity, Category } from '@/types/logi';

export interface AllTimeExport {
  activities: Activity[];
  weekTargets: Map<string, Record<Category, number>>;
  range: Range;
  debt: Partial<Record<Category, number>>;
}

/**
 * All data in one tap.
 *
 * Includes targets and the debt ledger so the file stands alone: open it and
 * you can rebuild "how much was planned" and "how much is owed", no app needed.
 */
export async function fetchAllTime(uid: string): Promise<AllTimeExport> {
  const [activities, targets, debt] = await Promise.all([
    listAll(uid),
    listAllWeekTargets(uid),
    getDebt(uid),
  ]);

  const weekTargets = new Map<string, Record<Category, number>>();
  for (const t of targets) weekTargets.set(t.week, t.weekly);

  const dates = activities.map((a) => a.logicalDate).sort();
  const range: Range = {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    kind: 'custom',
    isPartial: false,
  };

  return { activities, weekTargets, range, debt: debt.balance };
}

const QUIET: ExportNudge = { show: false, text: '', daysAgo: null };

/**
 * The export reminder line on Analytics.
 *
 * Reads 2 docs per screen open: `meta/backup` and the oldest record. Cheap,
 * and only runs once signed in.
 */
export function useExportNudge(now: number): { nudge: ExportNudge; markDone: () => void } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [lastExport, setLastExport] = useState<number | null>(null);
  const [firstRecord, setFirstRecord] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // User changed → forget everything during render, never remind the wrong person.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setReady(false);
  }

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void Promise.all([getLastExport(uid), firstActivityDate(uid)])
      .then(([last, first]) => {
        if (!alive) return;
        setLastExport(last);
        setFirstRecord(first);
        setReady(true);
      })
      // The reminder is secondary. On a read error stay quiet, do not intrude on Analytics.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const markDone = useCallback(() => {
    if (!uid) return;
    const at = Date.now();
    setLastExport(at);
    void markExported(uid, at).catch(() => {});
  }, [uid]);

  return {
    nudge: ready ? exportNudge({ lastExport, firstRecord, now }) : QUIET,
    markDone,
  };
}
