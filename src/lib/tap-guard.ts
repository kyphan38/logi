// ---------------------------------------------------------------------------
// logi - Blocking mistaken clicks while scrolling (AMENDMENT-remove-sleep 6c)
//
// On iOS, a swipe ends with a `click` if the finger stops on a button. Start
// is one tap with no confirm step to catch it - so it must be blocked at the
// gesture layer.
//
// Three layers, all cheap:
//   1. the finger moved under 10px
//   2. total time under 500ms
//   3. not within 300ms after the last scroll
//
// The fourth layer (a 5-second Undo) lives in the UI since it needs a toast.
//
// Pure file: no React, no DOM - tested with `node --test`.
// ---------------------------------------------------------------------------

/** A finger moving further than this is swiping, not tapping. */
export const MOVE_LIMIT_PX = 10;

/** Holding longer than this means something else on purpose, not a tap. */
export const PRESS_LIMIT_MS = 500;

/** Right after a scroll every tap is suspect. */
export const SCROLL_BLOCK_MS = 300;

export interface Press {
  /** Coordinates at `pointerdown`. */
  downX: number;
  downY: number;
  downAt: number;
  /** Coordinates at `pointerup`. */
  upX: number;
  upY: number;
  upAt: number;
  /** The last `scroll`. Never scrolled → null. */
  lastScrollAt: number | null;
}

/** Straight-line distance, not per axis - a diagonal swipe is still a swipe. */
export function pressDistance(p: Press): number {
  return Math.hypot(p.upX - p.downX, p.upY - p.downY);
}

/**
 * Does this touch count as a real tap?
 *
 * Every condition is "must be within the threshold" - when in doubt, skip. A
 * missed real tap means tapping again; a swipe taken as a tap means a session
 * appears out of nowhere.
 */
export function isRealTap(p: Press): boolean {
  if (pressDistance(p) > MOVE_LIMIT_PX) return false;
  if (p.upAt - p.downAt >= PRESS_LIMIT_MS) return false;
  if (p.lastScrollAt !== null && p.upAt - p.lastScrollAt < SCROLL_BLOCK_MS) return false;
  return true;
}
