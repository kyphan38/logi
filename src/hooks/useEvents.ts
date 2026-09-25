'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useTick } from '@/hooks/useActivities';
import { subscribeEvents } from '@/lib/event-store';
import { splitEvents } from '@/lib/events';
import type { EventItem } from '@/types/logi';

const EMPTY: EventItem[] = [];

/**
 * Sự kiện sắp tới, đã tách thành hai khối và sắp xong.
 *
 * Nhịp đồng hồ là 60 GIÂY chứ không phải mỗi phút thật sự cần: chuỗi "In 3
 * days" chỉ đổi lúc 04:00. Nhưng app để mở qua đêm là chuyện thường, và một
 * danh sách nói "Tomorrow" trong khi hôm nay đã là ngày đó thì sai theo kiểu
 * người dùng nhìn là thấy.
 */
export function useEvents() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const now = useTick(60_000, true);

  const [events, setEvents] = useState<EventItem[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Đổi user → xoá ngay trong lúc render, không chờ effect.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    setEvents(EMPTY);
    setError(null);
    setLoading(uid !== null);
  }

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeEvents(
      uid,
      (list) => {
        setEvents(list);
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

  const { upcoming, past } = useMemo(() => splitEvents(events, now), [events, now]);

  return { events, upcoming, past, now, loading, error };
}
