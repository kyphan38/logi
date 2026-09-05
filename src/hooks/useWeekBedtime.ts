'use client';

// ---------------------------------------------------------------------------
// logi - Mốc đi ngủ của MỘT khoảng ngắn (tab Week)
//
// `getDocs` một lượt chứ không mở listener: 7 đêm đã qua thì không đổi nữa, mở
// listener ở đây là trả tiền realtime cho thứ đứng yên. Cùng lý do với
// `useTrend`.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listDayLogs } from '@/lib/bedtime-store';
import type { DayLog } from '@/types/logi';

const EMPTY: DayLog[] = [];

export function useWeekBedtime(from: string, to: string): { logs: DayLog[]; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [logs, setLogs] = useState<DayLog[]>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void (async () => {
      // Đặt trong callback async, không đặt thẳng ở thân effect: eslint
      // `set-state-in-effect` cấm gọi setState đồng bộ ở thân effect vì gây
      // render nối tầng. Trong callback thì chỉ chạy khi fetch thật sự bắt đầu.
      if (alive) setLoading(true);
      try {
        const out = await listDayLogs(uid, from, to);
        if (alive) setLogs(out);
      } catch {
        // Card tự hiện trạng thái rỗng. Một lỗi ở ô phụ không nên nuốt cả trang.
        if (alive) setLogs(EMPTY);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, from, to]);

  return { logs, loading };
}
