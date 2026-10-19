'use client';

import { useEffect, useState } from 'react';

import { reducedMotion } from '@/lib/motion';

/**
 * Keeps something mounted for `exitMs` after `open` turns false, so it can
 * animate out. `leaving` is true during that time.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  const instant = reducedMotion();

  // Opening mounts right away, during render, so there is no empty frame.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMounted(true);
  }

  // Closing unmounts after the exit animation. With reduced motion the
  // return value already hides it, so no timer is needed.
  useEffect(() => {
    if (open || instant || !mounted) return;
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, mounted, exitMs, instant]);

  return { mounted: open || (mounted && !instant), leaving: !open && mounted && !instant };
}
