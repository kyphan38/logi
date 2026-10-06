'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import {
  abandonStaleScheduled,
  NO_PENDING,
  promoteScheduled,
  subscribeActive,
  subscribeByDate,
  subscribeByWeek,
  subscribeRecentDates,
  subscribeScheduled,
  type SnapMeta,
} from '@/lib/activities';
import { actualHours, overlapHours } from '@/lib/balance';
import type { Activity, Category } from '@/types/logi';

const EMPTY: Activity[] = [];
const EMPTY_META: SnapMeta = { hasPendingWrites: false, fromCache: false, pendingIds: NO_PENDING };

/**
 * Offline, a Firestore write promise only resolves once the server gets it -
 * possibly hours later. The local cache updates at once, so the UI only locks
 * for at most `ms`, then unlocks. A late error is still reported via `onLateError`.
 */
export function capWait(
  p: Promise<unknown>,
  onLateError: (e: unknown) => void,
  ms = 1200
): Promise<void> {
  let capped = false;
  const guarded = p.then(
    () => undefined,
    (e) => {
      if (!capped) throw e;
      onLateError(e);
    }
  );
  const cap = new Promise<void>((resolve) =>
    setTimeout(() => {
      capped = true;
      resolve();
    }, ms)
  );
  return Promise.race([guarded, cap]);
}

// ------------------------------------------------------------
// Running sessions
// ------------------------------------------------------------

export function useActiveActivities() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<SnapMeta>(EMPTY_META);
  const [error, setError] = useState<string | null>(null);

  // User changed → reset during render (never show the old user's data).
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setActivities(EMPTY);
    setError(null);
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeActive(
      uid,
      (list, m) => {
        setActivities(list);
        setMeta(m);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError((e as Error).message);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return {
    activities,
    loading,
    hasPendingWrites: meta.hasPendingWrites,
    pendingIds: meta.pendingIds,
    fromCache: meta.fromCache,
    error,
  };
}

// ------------------------------------------------------------
// Scheduled sessions (Task 6)
// ------------------------------------------------------------

/** If the time comes while the app is closed, nobody promotes. So recheck every 30 seconds. */
const PROMOTE_EVERY_MS = 30_000;

/**
 * `scheduled` sessions not yet due, plus moving them to `active` automatically.
 *
 * No push notification: the app being open is enough to promote. Runs on
 * mount, when the app returns to the foreground, and every 30 seconds while a
 * record is due. `startAt` keeps its scheduled value, so opening the app late
 * shows a timer already counting - truly "started at 22:05".
 */
export function useScheduledActivities() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [meta, setMeta] = useState<SnapMeta>(EMPTY_META);

  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setActivities(EMPTY);
  }

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeScheduled(uid, (list, m) => {
      setActivities(list);
      setMeta(m);
    });
    return unsub;
  }, [uid]);

  // Two overlapping promotions would overwrite each other. Only one at a time.
  const running = useRef(false);
  const promote = useCallback(async () => {
    if (!uid || running.current) return;
    running.current = true;
    try {
      // Clean up first, then promote: a booking from ten days ago must become
      // 'abandoned', never a session running for 240 hours.
      await abandonStaleScheduled(uid);
      await promoteScheduled(uid);
    } catch {
      // Offline: promote next time. Nothing to tell the user.
    } finally {
      running.current = false;
    }
  }, [uid]);

  // Mount (and every user change).
  useEffect(() => {
    void promote();
  }, [promote]);

  // Back to the foreground - the most common case: booked 22:05, app opened at 22:30.
  useOnForeground(() => void promote());

  // The time comes while the app is open. Only query when a record is really due.
  const due = activities.length > 0 ? activities[0].startAt : null;
  useEffect(() => {
    if (due === null) return;
    const id = setInterval(() => {
      if (Date.now() >= due) void promote();
    }, PROMOTE_EVERY_MS);
    return () => clearInterval(id);
  }, [due, promote]);

  return { activities, pendingIds: meta.pendingIds };
}

// ------------------------------------------------------------
// One logical day
// ------------------------------------------------------------

export function useDayActivities(logicalDate: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<SnapMeta>(EMPTY_META);
  const [error, setError] = useState<string | null>(null);

  // User or day changed → reset during render.
  const key = uid && logicalDate ? `${uid}|${logicalDate}` : null;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setActivities(EMPTY);
    setError(null);
    setLoading(key !== null);
  }

  useEffect(() => {
    if (!uid || !logicalDate) return;
    const unsub = subscribeByDate(
      uid,
      logicalDate,
      (list, m) => {
        setActivities(list);
        setMeta(m);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError((e as Error).message);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid, logicalDate]);

  // Running sessions count up to "now" → re-tick every minute so totals stay right.
  const now = useTick(60_000, activities.some((a) => a.endAt === null));

  const totals = useMemo(
    () => actualHours(activities, now) as Record<Category, number>,
    [activities, now]
  );
  const overlap = useMemo(() => overlapHours(activities, now), [activities, now]);

  return {
    activities,
    totals,
    overlap,
    loading,
    hasPendingWrites: meta.hasPendingWrites,
    pendingIds: meta.pendingIds,
    error,
  };
}

// ------------------------------------------------------------
// Logical days with data - for the small dots under the day strip
// ------------------------------------------------------------

const NO_DATES: ReadonlySet<string> = new Set();

export function useRecentDates(sinceDate: string): ReadonlySet<string> {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [dates, setDates] = useState<ReadonlySet<string>>(NO_DATES);

  // User changed → clear during render, do not wait for an effect.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setDates(NO_DATES);
  }

  useEffect(() => {
    if (!uid) return;
    return subscribeRecentDates(uid, sinceDate, setDates, () => setDates(NO_DATES));
  }, [uid, sinceDate]);

  return dates;
}

// ------------------------------------------------------------
// Timer - derived state
// ------------------------------------------------------------

/**
 * Re-render tick. NO accumulation: only pushes a fresh Date.now() into state.
 * iOS throttles background timers hard, so resync when the tab returns to the
 * foreground - without it the timer shows a stale value when the app opens.
 */
export function useTick(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;

    const tick = () => setNow(Date.now());
    tick();

    const iv = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [intervalMs, enabled]);

  return now;
}

/** SECONDS elapsed. Always = now - startAt, never a counter. */
export function useElapsed(startAt: number): number {
  const now = useTick(1000, true);
  return Math.max(0, Math.floor((now - startAt) / 1000));
}

// ------------------------------------------------------------
// One logical week - for the balance banner
// ------------------------------------------------------------

export function useWeekActivities(logicalWeek: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [loading, setLoading] = useState(true);

  const key = uid && logicalWeek ? `${uid}|${logicalWeek}` : null;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setActivities(EMPTY);
    setLoading(key !== null);
  }

  useEffect(() => {
    if (!uid || !logicalWeek) return;
    return subscribeByWeek(
      uid,
      logicalWeek,
      (list) => {
        setActivities(list);
        setLoading(false);
      },
      // The banner is secondary. If the query fails it quietly disappears, never
      // pushing an error onto Now that nobody can act on.
      () => setLoading(false)
    );
  }, [uid, logicalWeek]);

  return { activities, loading };
}

// ------------------------------------------------------------
// Foreground: rerun something whenever the app comes back
// ------------------------------------------------------------

export function useOnForeground(fn: () => void) {
  const ref = useRef(fn);

  useEffect(() => {
    ref.current = fn;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, []);
}

// ------------------------------------------------------------
// Network status
// ------------------------------------------------------------

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}

// ------------------------------------------------------------
// Small shared toast
// ------------------------------------------------------------

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export function useToasts(ttlMs = 5000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, action?: Toast['action']) => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, action }]);
      setTimeout(() => dismiss(id), ttlMs);
      return id;
    },
    [dismiss, ttlMs]
  );

  return { toasts, push, dismiss };
}
