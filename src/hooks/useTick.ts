'use client';

import { useEffect, useState } from 'react';

/**
 * Re-render tick. NO accumulation: only pushes a fresh Date.now() into state.
 * iOS throttles background timers hard, so resync when the tab returns to the
 * foreground - without it the timer shows a stale value when the app opens.
 */
export function useTick(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;

    const tick = () => setNow(Date.now());
    tick();

    const iv = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [intervalMs, enabled]);

  return now;
}

/** SECONDS elapsed. Always = now - startAt, never a counter. */
export function useElapsed(startAt: number): number {
  const now = useTick(1000, true);
  return Math.max(0, Math.floor((now - startAt) / 1000));
}
