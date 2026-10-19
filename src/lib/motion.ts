// Motion helpers with no React, so `node --test` can cover them.

/** Users who ask for less motion, and Node (tests, server render), skip motion. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Items that were in `prev` but are gone from `next`, so they can animate out. */
export function leavingItems<T extends { id: string | number }>(prev: T[], next: T[]): T[] {
  const kept = new Set(next.map((x) => x.id));
  return prev.filter((x) => !kept.has(x.id));
}

/** Close when dragged past a quarter of the sheet, or flicked fast. */
export function sheetShouldClose(dy: number, height: number, velocityPxPerMs: number): boolean {
  return dy > height * 0.25 || velocityPxPerMs > 0.5;
}

/** Dragging up past the top only moves a little. */
export function dragOffset(dy: number): number {
  return dy >= 0 ? dy : dy * 0.2;
}

/** Indexes of characters that differ, for two strings of the same shape. */
export function changedDigits(prev: string, next: string): number[] {
  if (prev.length !== next.length) return [...next].map((_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < next.length; i++) if (prev[i] !== next[i]) out.push(i);
  return out;
}
