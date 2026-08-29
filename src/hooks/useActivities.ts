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
 * Offline, promise của write Firestore chỉ resolve khi server nhận được - có thể
 * chờ hàng giờ. Cache local đã cập nhật ngay, nên UI chỉ khoá tối đa `ms` rồi mở.
 * Lỗi đến muộn vẫn được báo qua `onLateError`.
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
// Session đang chạy
// ------------------------------------------------------------

export function useActiveActivities() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<SnapMeta>(EMPTY_META);
  const [error, setError] = useState<string | null>(null);

  // Đổi user → reset ngay trong lúc render (tránh hiện dữ liệu của user cũ).
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
// Session đã hẹn giờ (Task 6)
// ------------------------------------------------------------

/** Tới giờ rồi mà app đang đóng thì không ai promote. Nên kiểm lại mỗi 30 giây. */
const PROMOTE_EVERY_MS = 30_000;

/**
 * Các session `scheduled` chưa tới giờ, kèm luôn việc tự chuyển sang `active`.
 *
 * Không dùng push notification: chỉ cần app mở là promote. Chạy khi mount, khi
 * app quay lại foreground, và mỗi 30 giây lúc có record tới hạn. `startAt` giữ
 * nguyên giá trị đã hẹn, nên mở app muộn thì timer đã đếm sẵn - đúng nghĩa
 * "bắt đầu lúc 22:05".
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

  // Hai lần promote chồng nhau sẽ ghi đè lẫn nhau. Cho chạy một lần một thôi.
  const running = useRef(false);
  const promote = useCallback(async () => {
    if (!uid || running.current) return;
    running.current = true;
    try {
      // Dọn trước, promote sau: buổi hẹn mười ngày trước phải thành
      // 'abandoned', không được biến thành session đang chạy 240 tiếng.
      await abandonStaleScheduled(uid);
      await promoteScheduled(uid);
    } catch {
      // Mất mạng thì lần sau promote. Không có gì để báo người dùng.
    } finally {
      running.current = false;
    }
  }, [uid]);

  // Mount (và mỗi lần đổi user).
  useEffect(() => {
    void promote();
  }, [promote]);

  // Quay lại foreground - hay gặp nhất: hẹn 22:05, mở app lúc 22:30.
  useOnForeground(() => void promote());

  // Đang mở app mà tới giờ. Chỉ query khi thật sự có record quá hạn.
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
// Một ngày logic
// ------------------------------------------------------------

export function useDayActivities(logicalDate: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [activities, setActivities] = useState<Activity[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<SnapMeta>(EMPTY_META);
  const [error, setError] = useState<string | null>(null);

  // Đổi user hoặc đổi ngày → reset ngay trong lúc render.
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

  // Session đang chạy được tính tới "bây giờ" → nhịp lại mỗi phút cho tổng đúng.
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
// Những ngày logic có dữ liệu - cho chấm nhỏ dưới dải ngày
// ------------------------------------------------------------

const NO_DATES: ReadonlySet<string> = new Set();

export function useRecentDates(sinceDate: string): ReadonlySet<string> {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [dates, setDates] = useState<ReadonlySet<string>>(NO_DATES);

  // Đổi user → xoá ngay trong lúc render, không chờ effect.
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
 * Nhịp re-render. KHÔNG cộng dồn: chỉ đẩy Date.now() mới vào state.
 * iOS throttle rất mạnh timer chạy nền, nên phải sync lại khi tab quay lại
 * foreground - thiếu bước này thì mở app lên timer đứng ở giá trị cũ.
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

/** Số GIÂY đã trôi qua. Luôn = now - startAt, không bao giờ là counter. */
export function useElapsed(startAt: number): number {
  const now = useTick(1000, true);
  return Math.max(0, Math.floor((now - startAt) / 1000));
}

// ------------------------------------------------------------
// Một tuần logic - cho balance banner
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
      // Banner là thứ phụ. Query hỏng thì im lặng biến mất, đừng chen vào
      // màn hình Now bằng một thông báo lỗi không ai làm gì được.
      () => setLoading(false)
    );
  }, [uid, logicalWeek]);

  return { activities, loading };
}

// ------------------------------------------------------------
// Foreground: chạy lại việc gì đó mỗi khi app quay lại
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
// Trạng thái mạng
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
// Toast nhỏ dùng chung
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
