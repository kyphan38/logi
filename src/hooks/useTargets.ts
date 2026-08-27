'use client';

// ============================================================
// logi — Target tuần + sổ nợ cho UI.
//
// `useRollover()` là chốt chuyển tuần. Không có server cron, nên nó chạy
// ở client lúc mở app và lúc app quay lại foreground.
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

/** Tuần logic hiện tại, tự đổi lúc 04:00 sáng thứ Hai mà không cần reload. */
export function useCurrentWeek(): string {
  return logicalWeek(useTick(60_000, true));
}

// ------------------------------------------------------------
// Chuyển tuần
// ------------------------------------------------------------

/**
 * Chạy rollover một lần cho mỗi tuần, mỗi phiên app.
 *
 * Ba lớp chống chạy trùng, vì cộng nợ hai lần thì im lặng và rất khó lần ra:
 *  1. `once` — chặn hai lần gọi song song trong cùng một tab.
 *  2. `runTransaction` trong `targets.ts` — chặn hai tab / hai máy.
 *  3. Cột mốc `lastProcessedWeek` — chặn mọi lần chạy về sau.
 *
 * Lỗi thì nuốt: người dùng không làm gì được với "rollover failed", và
 * lần mở app sau sẽ thử lại.
 */
export function useRollover(): RolloverResult | null {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const week = useCurrentWeek();

  const [result, setResult] = useState<RolloverResult | null>(null);
  const once = useRef(createOnce());

  const run = useCallback(() => {
    if (!uid) return;
    // Offline thì transaction treo tới khi có mạng. Để lần sau.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    void once.current
      .run(`${uid}|${week}`, async () => {
        const res = await runRollover(uid);
        setResult(res);
        // Khoá lười. Hai tuần cần kiểm:
        //  - tuần trước: rollover có thể chưa chạm tới (VD tuần đó không có doc).
        //  - tuần này: từ 21:00 CN tới 04:00 T2 thì tuần "hiện tại" đã đóng sổ
        //    rồi, nhưng rollover chưa chạy vì cột mốc vẫn là tuần này.
        for (const w of [addWeeks(week, -1), week]) {
          await lockIfClosed(uid, w).catch(() => {});
        }
      })
      .catch(() => {
        // `once` đã nhả id ra rồi — lần foreground sau sẽ thử lại.
      });
  }, [uid, week]);

  useEffect(run, [run]);
  useOnForeground(run);

  return result;
}

// ------------------------------------------------------------
// Target của một tuần
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
// Sổ nợ
// ------------------------------------------------------------

export function useDebt() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [balance, setBalance] = useState<DebtBalance>(EMPTY_DEBT);
  const [loading, setLoading] = useState(true);

  // Đổi user → xoá sổ nợ ngay trong lúc render, đừng để nợ người này
  // hiện trên màn hình người kia dù chỉ một frame.
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
    /** Nợ quá 20h thì Crunch bị khoá — không thể vay thêm mãi. */
    crunchLocked: total > DEBT_LOCK_THRESHOLD,
  };
}

// ------------------------------------------------------------
// Lịch sử preset
// ------------------------------------------------------------

/** 6 tuần gần nhất, để hỏi "4/6 tuần crunch — đây có còn là ngoại lệ không?" */
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
