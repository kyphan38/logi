'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { logicalDate } from '@/lib/balance';
import { EMPTY_LOG, setBedtime as saveBedtime, subscribeDayLog } from '@/lib/bedtime-store';
import type { DayLog } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Mốc bedtime của một ngày logic (Stage 8)
//
// Bedtime là MỘT MỐC trong dayLogs, không phải activity: không target, không
// vào ngân sách 89h, không hiện ở Balance / By day / When.
// ---------------------------------------------------------------------------

export function useDayLog(date: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [log, setLog] = useState<DayLog>(() => EMPTY_LOG(date ?? ''));
  const [loading, setLoading] = useState(true);

  const key = uid && date ? `${uid}|${date}` : null;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setLog(EMPTY_LOG(date ?? ''));
    setLoading(key !== null);
  }

  useEffect(() => {
    if (!uid || !date) return;
    return subscribeDayLog(uid, date, (l) => {
      setLog(l);
      setLoading(false);
    });
  }, [uid, date]);

  return { log, loading };
}

/** '2026-09-05' → '2026-09-04'. Lấy trưa hôm trước cho khỏi đụng mốc cắt 04:00. */
function prevDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return logicalDate(new Date(y, m - 1, d - 1, 12).getTime());
}

/**
 * Mốc của đêm nay và đêm qua.
 *
 * Luật "giờ gần nhất trong quá khứ" không bao giờ với xa hơn 24 tiếng, nên mọi
 * mốc ghi được từ sheet đều rơi vào đúng một trong hai đêm này - đủ để vừa hiện
 * trạng thái vừa biết giá trị cũ trước khi ghi đè.
 */
export function useRecentBedtime(date: string | null) {
  const tonight = useDayLog(date);
  const lastNight = useDayLog(date ? prevDate(date) : null);
  return {
    tonight: tonight.log,
    lastNight: lastNight.log,
    loading: tonight.loading || lastNight.loading,
  };
}

/** Ghi "đi ngủ lúc này". Trả về ngày logic mà mốc rơi vào (qua 00:00 thì là hôm trước). */
export async function logBedtime(uid: string, at: number): Promise<string> {
  return saveBedtime(uid, at);
}

/** Ngày logic của mốc bedtime - để toast nói rõ ghi vào đêm nào. */
export function bedtimeDate(at: number): string {
  return logicalDate(at);
}
