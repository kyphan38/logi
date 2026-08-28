'use client';

// ------------------------------------------------------------
// logi — Weekly Review (Stage 6 Task 1)
//
// Đọc dữ liệu cho ba màn review. Không thêm listener nào cho tuần hiện tại:
// dùng lại `useWeekActivities` và `useWeekTarget` đã có.
// ------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useTick, useWeekActivities } from '@/hooks/useActivities';
import { useCrunchStreak, useDebt, useWeekTarget } from '@/hooks/useTargets';
import { buildReview, canSetNextWeek, reviewDueWeek, type ReviewSummary } from '@/lib/review';
import { subscribeReviews, type ReviewFlags } from '@/lib/targets';
import type { Weekly } from '@/lib/rollover';

export function useReviewFlags(): { flags: ReviewFlags; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [flags, setFlags] = useState<ReviewFlags>({});
  const [loading, setLoading] = useState(true);

  // Đổi user → xoá cờ ngay trong lúc render, đừng để cờ người này
  // giấu banner của người kia dù chỉ một frame.
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
 * Tuần đang cần review, hoặc null.
 * Tick 60s là đủ — mốc là 19:00, không ai cần độ chính xác từng giây.
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
  /** Sổ nợ hiện tại — màn 3 dùng để hiện phần cộng thêm. */
  debt: ReturnType<typeof useDebt>;
  /** Tuần đã qua thì chỉ xem. */
  canSetNext: boolean;
  loading: boolean;
}

export function useReviewData(week: string | null): ReviewData {
  const now = useTick(60_000, week !== null);
  const { activities, loading: loadingActs } = useWeekActivities(week);
  const { target, loading: loadingTarget } = useWeekTarget(week);
  const { history } = useCrunchStreak(week);
  const debt = useDebt();

  const summary = useMemo(() => {
    if (!week || loadingActs || loadingTarget) return null;
    const weekTargets = new Map<string, Weekly>();
    if (target) weekTargets.set(week, target.weekly);
    return buildReview({ week, activities, weekTargets, history, now });
  }, [week, activities, target, history, now, loadingActs, loadingTarget]);

  return {
    summary,
    debt,
    canSetNext: week ? canSetNextWeek(week, now) : false,
    loading: loadingActs || loadingTarget,
  };
}
