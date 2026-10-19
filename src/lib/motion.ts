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
