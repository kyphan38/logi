'use client';

// ------------------------------------------------------------
// logi - Weekly Review (Stage 6 Task 1)
//
// Reads data for the three review screens. Adds no listener for the current
// week: reuses the existing `useWeekActivities` and `useWeekTarget`.
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useTick, useWeekActivities } from '@/hooks/useActivities';
import { useCrunchStreak, useDebt, useWeekTarget } from '@/hooks/useTargets';
import { buildReview, canSetNextWeek, reviewDueWeek, type ReviewSummary } from '@/lib/review';
import { subscribeReviews, type ReviewFlags } from '@/lib/targets';
import type { Weekly } from '@/lib/rollover';
import type { Activity } from '@/types/logi';

export function useReviewFlags(): { flags: ReviewFlags; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [flags, setFlags] = useState<ReviewFlags>({});
  const [loading, setLoading] = useState(true);

  // User changed → clear the flag during render, so one person's flag never
  // hides another's banner, not even for a frame.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setFlags({});
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    return subscribeReviews(
      uid,
      (f) => {
        setFlags(f);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [uid]);

  return { flags, loading };
}

/**
 * The week needing review, or null.
 * A 60s tick is enough - the mark is 19:00, nobody needs second precision.
 */
export function useReviewDue(): string | null {
  const now = useTick(60_000, true);
  const { flags, loading } = useReviewFlags();

  return useMemo(() => {
    if (loading) return null;
    return reviewDueWeek(now, (w) => flags[w] != null);
  }, [now, flags, loading]);
}

export interface ReviewData {
  summary: ReviewSummary | null;
  /** The week's records - Stage 7 reuses them for the digest, no second read. */
  activities: Activity[];
  weekTargets: Map<string, Weekly>;
  /** The same time mark the summary used. */
  now: number;
  /** The current debt ledger - screen 3 uses it to show the added amount. */
  debt: ReturnType<typeof useDebt>;
  /** A past week is view-only. */
  canSetNext: boolean;
  loading: boolean;
}

export function useReviewData(week: string | null): ReviewData {
  const now = useTick(60_000, week !== null);
  const { activities, loading: loadingActs } = useWeekActivities(week);
  const { target, loading: loadingTarget } = useWeekTarget(week);
  const { history } = useCrunchStreak(week);
  const debt = useDebt();

  const weekTargets = useMemo(() => {
    const m = new Map<string, Weekly>();
    if (week && target) m.set(week, target.weekly);
    return m;
  }, [week, target]);

  const summary = useMemo(() => {
    if (!week || loadingActs || loadingTarget) return null;
    return buildReview({ week, activities, weekTargets, history, now });
  }, [week, activities, weekTargets, history, now, loadingActs, loadingTarget]);

  return {
    summary,
    activities,
    weekTargets,
    now,
    debt,
    canSetNext: week ? canSetNextWeek(week, now) : false,
    loading: loadingActs || loadingTarget,
  };
}
