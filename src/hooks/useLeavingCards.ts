'use client';

import { useEffect, useState } from 'react';

import { leavingItems, reducedMotion } from '@/lib/motion';
import type { Activity } from '@/types/logi';

/** Matches `.row-out` in globals.css. */
const CARD_EXIT_MS = 180;

/**
 * Session cards for the Now screen, with motion state.
 * Cards rise in when a session starts while the page is open, and slide out
 * when it stops. The stream drops a stopped session at once, so it is kept
 * here for the exit animation. Data from the first load just appears.
 */
export function useLeavingCards(active: Activity[], activeLoading: boolean) {
  const [ready, setReady] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  const [leaving, setLeaving] = useState<Activity[]>([]);
  const [risen, setRisen] = useState<Set<string>>(() => new Set());
  if (active !== prevActive) {
    if (ready && !reducedMotion()) {
      const stopped = leavingItems(prevActive, active);
      const before = new Set(prevActive.map((a) => a.id));
      const added = active.filter((a) => !before.has(a.id)).map((a) => a.id);
      if (stopped.length > 0) setLeaving((l) => [...l, ...stopped]);
      if (added.length > 0) setRisen((r) => new Set([...r, ...added]));
    }
    setPrevActive(active);
  }
  if (!ready && !activeLoading) setReady(true);

  useEffect(() => {
    if (leaving.length === 0) return;
    const ids = new Set(leaving.map((a) => a.id));
    const t = setTimeout(() => setLeaving((l) => l.filter((a) => !ids.has(a.id))), CARD_EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const gone = leaving.filter((a) => !active.some((x) => x.id === a.id));
  // Both lists render in one flex column; `order` keeps them by start time.
  const cards = [...active, ...gone].sort((a, b) => a.startAt - b.startAt);
  const slot = new Map(cards.map((a, i) => [a.id, i]));

  return { cards, gone, slot, risen };
}
