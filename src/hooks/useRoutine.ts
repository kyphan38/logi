'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { EMPTY_CHECKS, setChecked, subscribeChecks, subscribeRoutines } from '@/lib/routine-store';
import type { RoutineChecks, RoutineGroup } from '@/types/logi';

const EMPTY_GROUPS: RoutineGroup[] = [];

/** Nhóm routine đang dùng (đã lọc archive), theo thứ tự. */
export function useRoutines() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [groups, setGroups] = useState<RoutineGroup[]>(EMPTY_GROUPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setGroups(EMPTY_GROUPS);
    setError(null);
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    return subscribeRoutines(
      uid,
      (list) => {
        setGroups(list);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    );
  }, [uid]);

  return { groups, loading, error };
}

/**
 * Tick của MỘT ngày logic, kèm bật/tắt.
 *
 * `date` đổi lúc 04:00 (người gọi tính từ `logicalDate`) → hook đọc doc của
 * ngày mới, đang trống. Đó là toàn bộ cơ chế "reset".
 *
 * Chạm đi trước, Firestore theo sau: `optimistic` thắng snapshot cho tới khi
 * snapshot bắt kịp, nếu không thì dấu tick nháy tắt rồi bật lại.
 */
export function useRoutineChecks(date: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [checks, setChecks] = useState<RoutineChecks>(() => EMPTY_CHECKS(date));
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const key = `${uid ?? ''}|${date}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setChecks(EMPTY_CHECKS(date));
    setOptimistic({});
  }

  useEffect(() => {
    if (!uid) return;
    return subscribeChecks(uid, date, (c) => {
      setChecks(c);
      // Server đã khớp với chạm nào thì thả chạm đó ra.
      setOptimistic((o) => {
        let changed = false;
        const next: Record<string, boolean> = {};
        for (const [id, on] of Object.entries(o)) {
          if ((c.checked[id] !== undefined) === on) changed = true;
          else next[id] = on;
        }
        return changed ? next : o;
      });
    });
  }, [uid, date]);

  const isChecked = useCallback(
    (id: string) => optimistic[id] ?? checks.checked[id] !== undefined,
    [optimistic, checks]
  );

  const toggle = useCallback(
    async (id: string) => {
      if (!uid) return;
      const on = !(optimistic[id] ?? checks.checked[id] !== undefined);
      setOptimistic((o) => ({ ...o, [id]: on }));
      try {
        await setChecked(uid, date, id, on);
      } catch (e) {
        // Ghi hỏng → trả về đúng những gì Firestore đang giữ.
        setOptimistic((o) => {
          const next = { ...o };
          delete next[id];
          return next;
        });
        throw e;
      }
    },
    [uid, date, optimistic, checks]
  );

  return { isChecked, toggle };
}
