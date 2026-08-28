'use client';

// ---------------------------------------------------------------------------
// logi - Dữ liệu cho màn hình Analytics (Stage 5)
//
// Một khoảng → MỘT query activities + MỘT query weekTargets. Không bao giờ
// lặp query theo từng ngày.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { subscribeByRange } from '@/lib/activities';
import { weeksOf, type Range } from '@/lib/range';
import { listWeekTargets } from '@/lib/targets';
import { PRESETS, type Activity, type Category, type WeekTarget } from '@/types/logi';

const EMPTY: Activity[] = [];

export interface RangeData {
  activities: Activity[];
  /** logicalWeek → target tuần đó. Tuần chưa có doc thì lùi về PRESETS.normal. */
  weekTargets: Map<string, Record<Category, number>>;
  /** Tuần bị đổi target sau 21:00 CN - chart phải nói ra, không giấu. */
  lateWeeks: Set<string>;
  loading: boolean;
  error: string | null;
  /** Dựng lại cả hai query. Dùng cho nút Retry khi mạng chập chờn. */
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

  // Đổi khoảng → xoá sạch số cũ ngay. Nếu không, chart sẽ hiển thị số của
  // khoảng trước dưới nhãn của khoảng mới trong một nhịp render.
  const key = uid ? `${uid}|${range.from}|${range.to}|${nonce}` : null;
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

  const { from, to } = range;

  useEffect(() => {
    if (!uid) return;
    void nonce; // Retry: đổi nonce là chạy lại cả hai effect.
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
    let alive = true;
    const weeks = weeksOf({ from, to });

    listWeekTargets(uid, weeks)
      .then((map) => {
        if (!alive) return;
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
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // Thiếu target thì chart vẫn vẽ được phần "actual"; đừng chặn cả trang.
        const out = new Map<string, Record<Category, number>>();
        for (const w of weeks) out.set(w, PRESETS.normal.weekly);
        setWeekTargets(out);
        setLoadingTargets(false);
        setError((e as Error).message);
      });

    return () => {
      alive = false;
    };
  }, [uid, from, to, nonce]);

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
