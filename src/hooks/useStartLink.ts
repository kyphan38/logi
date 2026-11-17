'use client';

import { useEffect, useRef } from 'react';

import { parseStartLink } from '@/lib/start-link';
import type { Category } from '@/types/logi';

/**
 * G4: /now?start=learn starts a session once, with the usual Undo toast.
 * Waits for the running list so a second start of the same category is caught.
 */
export function useStartLink(
  ready: boolean,
  start: (category: Category, label: string | null) => void,
) {
  const done = useRef(false);
  // The latest `start`, so the effect sees the signed-in uid without re-running.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const link = parseStartLink(window.location.search);
    if (!link) return;
    // Drop the query so a reload or Back does not start it again.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    startRef.current(link.category, link.label);
  }, [ready]);
}
