'use client';

// ------------------------------------------------------------
// logi - Backup (Stage 6 Task 3)
//
// Firestore free tier KHÔNG có backup tự động. Sau một năm ghi chép, dữ liệu
// này không tạo lại được. Hook ở đây lo hai việc: lấy toàn bộ dữ liệu để
// export, và nhắc export khi đã lâu không làm.
//
// Tất cả đều là đọc MỘT LẦN, không listener: đây là việc thỉnh thoảng mới
// làm, không cần theo dõi realtime và không đáng thêm quota.
// ------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { firstActivityDate, listAll } from '@/lib/activities';
import { exportNudge, type ExportNudge } from '@/lib/backup';
import { getDebt, getLastExport, listAllWeekTargets, markExported } from '@/lib/targets';
import type { Range } from '@/lib/range';
import type { Activity, Category } from '@/types/logi';

export interface AllTimeExport {
  activities: Activity[];
  weekTargets: Map<string, Record<Category, number>>;
  range: Range;
  debt: Partial<Record<Category, number>>;
}

/**
 * Toàn bộ dữ liệu trong một lần bấm.
 *
 * Kèm cả target và sổ nợ để file tự đủ nghĩa: mở file ra là dựng lại được
 * "đã định làm bao nhiêu" và "đang nợ bao nhiêu", không cần app.
 */
export async function fetchAllTime(uid: string): Promise<AllTimeExport> {
  const [activities, targets, debt] = await Promise.all([
    listAll(uid),
    listAllWeekTargets(uid),
    getDebt(uid),
  ]);

  const weekTargets = new Map<string, Record<Category, number>>();
  for (const t of targets) weekTargets.set(t.week, t.weekly);

  const dates = activities.map((a) => a.logicalDate).sort();
  const range: Range = {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    kind: 'custom',
    isPartial: false,
  };

  return { activities, weekTargets, range, debt: debt.balance };
}

const QUIET: ExportNudge = { show: false, text: '', daysAgo: null };

/**
 * Dòng nhắc export ở màn Analytics.
 *
 * Đọc 2 doc mỗi lần mở màn: `meta/backup` và record cũ nhất. Rẻ, và chỉ chạy
 * khi đã đăng nhập xong.
 */
export function useExportNudge(now: number): { nudge: ExportNudge; markDone: () => void } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [lastExport, setLastExport] = useState<number | null>(null);
  const [firstRecord, setFirstRecord] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Đổi user thì quên hết ngay trong lúc render, đừng nhắc nhầm người.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setReady(false);
  }

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void Promise.all([getLastExport(uid), firstActivityDate(uid)])
      .then(([last, first]) => {
        if (!alive) return;
        setLastExport(last);
        setFirstRecord(first);
        setReady(true);
      })
      // Nhắc là việc phụ. Lỗi đọc thì im lặng, không chen vào màn Analytics.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const markDone = useCallback(() => {
    if (!uid) return;
    const at = Date.now();
    setLastExport(at);
    void markExported(uid, at).catch(() => {});
  }, [uid]);

  return {
    nudge: ready ? exportNudge({ lastExport, firstRecord, now }) : QUIET,
    markDone,
  };
}
