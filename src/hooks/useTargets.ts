'use client';

// ============================================================
// logi - Weekly targets + debt ledger for the UI.
//
// `useRollover()` is the week rollover hook. There is no server cron, so it
// runs on the client when the app opens and returns to the foreground.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useOnForeground, useTick } from '@/hooks/useActivities';
import { crunchStreak, logicalWeek } from '@/lib/balance';
import { createOnce } from '@/lib/once';
import type { DebtBalance } from '@/lib/rollover';
import {
  getDebt,
  listRecentWeekTargets,
  lockIfClosed,
  runRollover,
  subscribeDebt,
  subscribeWeekTarget,
  totalDebt,
  type RolloverResult,
} from '@/lib/targets';
import { addWeeks } from '@/lib/week';
import { DEBT_LOCK_THRESHOLD, type WeekTarget } from '@/types/logi';

const EMPTY_DEBT: DebtBalance = {};

/** The current logical week; changes at 04:00 Monday by itself, no reload. */
export function useCurrentWeek(): string {
  return logicalWeek(useTick(60_000, true));
}

// ------------------------------------------------------------
// Week rollover
// ------------------------------------------------------------

/**
 * Runs rollover once per week, per app session.
 *
 * Three layers against double runs, because adding debt twice is silent and
 * very hard to trace:
 *  1. `once` - blocks two parallel calls in the same tab.
 *  2. `runTransaction` in `targets.ts` - blocks two tabs / two devices.
 *  3. The `lastProcessedWeek` marker - blocks every later run.
 *
 * Errors are swallowed: the user can do nothing with "rollover failed", and
 * the next app open retries.
 */
export function useRollover(): RolloverResult | null {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const week = useCurrentWeek();

  const [result, setResult] = useState<RolloverResult | null>(null);
  const once = useRef(createOnce());

  const run = useCallback(() => {
    if (!uid) return;
    // Offline, the transaction hangs until the network returns. Leave it for next time.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    void once.current
      .run(`${uid}|${week}`, async () => {
        const res = await runRollover(uid);
        setResult(res);
        // Lazy lock. Two weeks to check:
        //  - last week: rollover may not have reached it (e.g. that week has no doc).
        //  - this week: from 21:00 Sun to 04:00 Mon the "current" week is
        //    already closed, but rollover has not run since the marker is still this week.
        for (const w of [addWeeks(week, -1), week]) {
          await lockIfClosed(uid, w).catch(() => {});
        }
      })
      .catch(() => {
        // `once` has released the id - the next foreground retries.
      });
  }, [uid, week]);

  useEffect(run, [run]);
  useOnForeground(run);

  return result;
}

// ------------------------------------------------------------
// A week's target
// ------------------------------------------------------------

export function useWeekTarget(week: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [target, setTarget] = useState<WeekTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = uid && week ? `${uid}|${week}` : null;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setTarget(null);
    setError(null);
    setLoading(key !== null);
  }

  useEffect(() => {
    if (!uid || !week) return;
    return subscribeWeekTarget(
      uid,
      week,
      (wt) => {
        setTarget(wt);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError((e as Error).message);
        setLoading(false);
      }
    );
  }, [uid, week]);

  return { target, loading, error };
}

// ------------------------------------------------------------
// Debt ledger
// ------------------------------------------------------------

export function useDebt() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [balance, setBalance] = useState<DebtBalance>(EMPTY_DEBT);
  const [loading, setLoading] = useState(true);

  // User changed → clear the ledger during render, so one person's debt never
  // shows on another's screen, not even for a frame.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setBalance(EMPTY_DEBT);
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    return subscribeDebt(
      uid,
      (d) => {
        setBalance(d);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [uid]);

  const total = totalDebt(balance);
  return {
    balance,
    total,
    loading,
    /** Over 20h of debt locks Crunch - no borrowing forever. */
    crunchLocked: total > DEBT_LOCK_THRESHOLD,
  };
}

// ------------------------------------------------------------
// Preset history
// ------------------------------------------------------------

/** The last 6 weeks, to ask "4/6 weeks of crunch - is this still an exception?" */
export function useCrunchStreak(deps: unknown = null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [history, setHistory] = useState<WeekTarget[]>([]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void listRecentWeekTargets(uid, 6)
      .then((list) => {
        if (alive) setHistory(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, deps]);

  return { history, streak: crunchStreak(history) };
}

export { getDebt };
