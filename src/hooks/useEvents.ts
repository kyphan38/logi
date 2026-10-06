'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useTick } from '@/hooks/useActivities';
import { subscribeEvents } from '@/lib/event-store';
import { splitEvents } from '@/lib/events';
import type { EventItem } from '@/types/logi';

const EMPTY: EventItem[] = [];

/**
 * Upcoming events, split into two blocks and sorted.
 *
 * The clock ticks every 60 SECONDS, not because every minute matters: "In 3
 * days" only changes at 04:00. But leaving the app open overnight is common,
 * and a list saying "Tomorrow" when that day has already come is a visible error.
 */
export function useEvents() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const now = useTick(60_000, true);

  const [events, setEvents] = useState<EventItem[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User changed → clear during render, do not wait for an effect.
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
