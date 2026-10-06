// ---------------------------------------------------------------------------
// logi - Derived category colors (Stage 4.6 Task 1).
//
// The BASE colors are still CATEGORY_COLOR in logi.ts - this file does not
// change them, it only points to derived CSS variables in globals.css:
//   tint - timeline block fill (alpha ~0.12, inverts in dark mode)
//   ink  - text on tint (contrast >= 4.5 against that tint)
//
// Returns var(), not hex, so dark mode switches without JS.
// ---------------------------------------------------------------------------
import type { Category } from '@/types/logi';

export function catTint(c: Category): string {
  return `var(--cat-${c}-tint)`;
}

export function catInk(c: Category): string {
  return `var(--cat-${c}-ink)`;
}
