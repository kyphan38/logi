'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import {
  copyWeekPlan,
  EMPTY_PLAN,
  listAllTasks,
  saveWeekPlan,
  subscribePool,
  subscribeWeekPlan,
} from '@/lib/task-store';
import { addWeeks } from '@/lib/week';
import type { PlannedCell, PoolTask, WeekPlan } from '@/types/logi';

const EMPTY_POOL: PoolTask[] = [];

/**
 * Pool task đang dùng (đã lọc archive).
 *
 * Chỉ hàng đang hoạt động mới hiện trong lưới. Task đã archive vẫn nằm trong
 * Firestore để những tuần cũ đọc được tên - nhưng bản chụp trong ô mới là thứ
 * lưới đọc, nên archive không bao giờ làm lịch sử trống.
 */
export function usePool() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [tasks, setTasks] = useState<PoolTask[]>(EMPTY_POOL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setTasks(EMPTY_POOL);
    setError(null);
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribePool(
      uid,
      (list) => {
        setTasks(list);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { tasks, loading, error };
}

/**
 * Kế hoạch của MỘT tuần, kèm ghi.
 *
 * `cells` là nguồn sự thật cho lưới. Người dùng bật/tắt rất nhanh, nên state
 * local đi trước và Firestore theo sau (`save`); onSnapshot của chính mình
 * quay về sẽ trùng khớp nên không nháy.
 */
export function useWeekPlan(week: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [plan, setPlan] = useState<WeekPlan>(() => EMPTY_PLAN(week));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ô đang chờ ghi. Có thì nó thắng snapshot - snapshot cũ về sau sẽ nháy ngược. */
  const [pending, setPending] = useState<PlannedCell[] | null>(null);

  const key = `${uid ?? ''}|${week}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setPlan(EMPTY_PLAN(week));
    setPending(null);
    setError(null);
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeWeekPlan(
      uid,
      week,
      (p) => {
        setPlan(p);
        setLoading(false);
        setError(null);
        // Server đã bắt kịp bản nháp → thả state local ra.
        setPending((pend) => (pend && sameCells(pend, p.cells) ? null : pend));
      },
      (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    );
    return unsub;
  }, [uid, week]);

  const cells = pending ?? plan.cells;

  const save = useCallback(
    async (next: PlannedCell[]) => {
      if (!uid) return;
      setPending(next);
      try {
        await saveWeekPlan(uid, week, next);
      } catch (e) {
        // Ghi hỏng → trả lưới về đúng những gì Firestore đang giữ.
        setPending(null);
        throw e;
      }
    },
    [uid, week]
  );

  /** Nhân bản tuần trước sang tuần này. Trả về số ô đã chép. */
  const copyPrev = useCallback(async () => {
    if (!uid) return 0;
    const n = await copyWeekPlan(uid, addWeeks(week, -1), week);
    return n;
  }, [uid, week]);

  return { cells, plan, loading, error, save, copyPrev, hasPlan: plan.cells.length > 0 };
}

function sameCells(a: PlannedCell[], b: PlannedCell[]): boolean {
  if (a.length !== b.length) return false;
  const key = (c: PlannedCell) => `${c.taskId}|${c.dow}|${c.durationMin}|${c.title}|${c.category}`;
  const setB = new Set(b.map(key));
  return a.every((c) => setB.has(key(c)));
}

/**
 * Ô của HÔM NAY - cho checklist ở màn Now.
 *
 * Ngày logic đổi lúc 04:00, không phải nửa đêm; 01:00 vẫn phải thấy checklist
 * của hôm qua. Cả `week` lẫn `dow` đều lấy từ cùng một mốc thời gian nên không
 * bao giờ lệch nhau.
 */
export function useTodayCells(now: number) {
  const date = logicalDate(now);
  const week = logicalWeek(now);
  const dow = logicalWeekday(now);
  const { cells, loading } = useWeekPlan(week);
  return { date, week, dow, cells, loading };
}

/**
 * Toàn bộ task từng có (kể cả đã archive), tra theo id.
 *
 * Dùng ở `RecordSheet` để gắn session vào task: task đã archive vẫn phải gọi
 * được tên, nếu không thì session cũ hiện ra id trơ trọi.
 */
export function useTaskLookup(enabled: boolean) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [all, setAll] = useState<PoolTask[]>(EMPTY_POOL);

  useEffect(() => {
    if (!uid || !enabled) return;
    let alive = true;
    listAllTasks(uid)
      .then((list) => {
        if (alive) setAll(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, enabled]);

  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  return { all, byId };
}
