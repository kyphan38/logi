'use client';

import { useCallback, useEffect, useRef } from 'react';
import { isRealTap, type Press } from '@/lib/tap-guard';

/*
 * -----------------------------------------------------------------------------
 * // logi - Make a div tappable without catching swipes by mistake
 * -----------------------------------------------------------------------------
 *
 * On iOS, scrolling a list and lifting the finger still fires `click`. Rarely
 * a problem for real buttons, but session cards span almost the whole width of
 * Now - swiping across one is common. `isRealTap()` (src/lib/tap-guard.ts)
 * filters those cases; this file only handles React and the DOM.
 *
 * Scrolling belongs to the whole page, not each card. So there is one
 * listener, with a count of cards using it to know when to remove it.
 */

let lastScrollAt: number | null = null;
let users = 0;

function trackScroll(e: Event) {
  lastScrollAt = e.timeStamp;
}

/** `capture: true` to catch scrolls in child containers too, not just window. */
function subscribe(): () => void {
  users += 1;
  if (users === 1) {
    window.addEventListener('scroll', trackScroll, { passive: true, capture: true });
  }
  return () => {
    users -= 1;
    if (users === 0) {
      window.removeEventListener('scroll', trackScroll, { capture: true });
      lastScrollAt = null;
    }
  };
}

export interface TapHandlers {
  role: 'button';
  tabIndex: 0;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Returns props to spread onto a `<div>`. `undefined` without `onTap` - so
 * callers can spread it directly and the block stays inert as before.
 */
export function useTap(onTap: (() => void) | undefined): TapHandlers | undefined {
  const down = useRef<{ x: number; y: number; at: number } | null>(null);

  useEffect(subscribe, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, at: e.timeStamp };
  }, []);

  const clear = useCallback(() => {
    down.current = null;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || !onTap) return;
      const p: Press = {
        downX: d.x,
        downY: d.y,
        downAt: d.at,
        upX: e.clientX,
        upY: e.clientY,
        upAt: e.timeStamp,
        lastScrollAt,
      };
      if (!isRealTap(p)) return;
      onTap();
    },
    [onTap],
  );

  // A keyboard cannot swipe, so nothing to filter.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!onTap) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onTap();
    },
    [onTap],
  );

  if (!onTap) return undefined;

  return {
    role: 'button',
    tabIndex: 0,
    onPointerDown,
    onPointerUp,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onKeyDown,
  };
}
