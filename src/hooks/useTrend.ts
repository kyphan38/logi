'use client';

// ---------------------------------------------------------------------------
// logi - Dữ liệu cho ô Trend
//
// Đọc MỘT LẦN (`getDocs`), không mở listener: 6 tháng dữ liệu là hàng nghìn
// doc, mà số của tháng Tư thì không đổi nữa. Mở listener ở đây là trả tiền
// realtime cho thứ không bao giờ chạy.
//
// Đổi span nhỏ hơn (6 tuần ⊂ 6 tháng) vẫn phải đọc lại: khoảng khác nhau thì
// cache theo khoảng, giữ lại trong phiên để bấm qua bấm lại không tốn thêm.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listByRange } from '@/lib/activities';
import { listDayLogs } from '@/lib/bedtime-store';
import { weeksOf } from '@/lib/range';
import { listWeekTargets } from '@/lib/targets';
import { listWeekPlans } from '@/lib/task-store';
import { trendBuckets, trendWindow, type TrendSpan } from '@/lib/trend';
import type { Activity, Category, DayLog, WeekPlan } from '@/types/logi';

export interface TrendData {
  activities: Activity[];
  weekTargets: Map<string, Record<Category, number>>;
  /** Mốc đi ngủ trong cửa sổ. */
  dayLogs: DayLog[];
  /** Kế hoạch của các tuần trong cửa sổ. */
  weekPlans: Map<string, WeekPlan>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY: Activity[] = [];
const EMPTY_TARGETS = new Map<string, Record<Category, number>>();
const EMPTY_LOGS: DayLog[] = [];
const EMPTY_PLANS = new Map<string, WeekPlan>();

interface Cached {
  /** Khoảng mà số này thuộc về. Thiếu nó thì cột "6 tuần" nằm dưới nhãn "6 tháng". */
  key: string;
  activities: Activity[];
  weekTargets: Map<string, Record<Category, number>>;
  dayLogs: DayLog[];
  weekPlans: Map<string, WeekPlan>;
}

// Lấy đủ bốn nguồn trong MỘT lượt. Tab Trend hiện cả ba card cùng lúc nên
// tách theo `extra` chỉ làm activities bị đọc ba lần với ba cache key khác
// nhau. 26 tuần vẫn là một query trên `logicalDate`, không phải 26 query.
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

  // Số cũ chỉ được dùng khi nó đúng là số của khoảng đang xem.
  const fresh = data && data.key === key ? data : null;

  useEffect(() => {
    if (!key || !uid) return;

    // Bấm qua bấm lại giữa các span đã xem: lấy từ cache, không query lại.
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
        // Query song song: activities của cả cửa sổ + target của mọi tuần nó
        // chạm tới + bedtime + tasks. Không bao giờ lặp query theo từng cột.
        const [activities, targetDocs, dayLogs, weekPlans] = await Promise.all([
          listByRange(uid, win),
          listWeekTargets(uid, weeksOf(win)),
          listDayLogs(uid, win.from, win.to),
          listWeekPlans(uid, weeksOf(win)),
        ]);
        if (!alive) return;

        const weekTargets = new Map<string, Record<Category, number>>();
        for (const [w, t] of targetDocs) weekTargets.set(w, t.weekly);

        const next = { key, activities, weekTargets, dayLogs, weekPlans };
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
    // `win` được dựng lại mỗi render nhưng nội dung đã nằm gọn trong `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid, nonce]);

  return {
    activities: fresh?.activities ?? EMPTY,
    weekTargets: fresh?.weekTargets ?? EMPTY_TARGETS,
    dayLogs: fresh?.dayLogs ?? EMPTY_LOGS,
    weekPlans: fresh?.weekPlans ?? EMPTY_PLANS,
    loading: !fresh && (loading || error === null),
    error,
    reload: () => {
      if (key) cache.current.delete(key);
      setNonce((n) => n + 1);
    },
  };
}
