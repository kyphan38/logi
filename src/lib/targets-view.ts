// Pure parts of the Targets screen (modes, labels, short hour format).

import { CATEGORIES, type Category, type PresetId } from '@/types/logi';
import type { Weekly } from '@/lib/rollover';

export const PRESET_ORDER: PresetId[] = ['normal', 'crunch', 'deep_learn', 'recovery'];

/**
 * Custom is the FIFTH MODE, not a separate block underneath.
 *
 * Four presets used to sit in a dropdown while four sliders always showed
 * below under "CUSTOM". The screen said two opposite things at once:
 * "Mode: Recovery" above, "Custom 43.5h" below. Now there is ONE list of five
 * choices, and only the selected mode shows its controls.
 */
export type ModeId = PresetId | 'custom';
export const MODE_ORDER: ModeId[] = [...PRESET_ORDER, 'custom'];
export const SHORT: Record<Category, string> = {
  work: 'W',
  learn: 'L',
  fitness: 'F',
  leisure: 'Le',
};

export const h = (n: number) => `${Math.round(n * 10) / 10}h`;
export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * With Sleep gone, NO category is fixed: all 4 can be dragged
 * (AMENDMENT-remove-sleep section 11). The name `ADJUSTABLE` stays to avoid
 * touching every caller, but it now equals `CATEGORIES`.
 */
export const ADJUSTABLE = CATEGORIES;

export function summary(weekly: Weekly): string {
  return ADJUSTABLE.map((c) => `${SHORT[c]}${Math.round(weekly[c])}`).join(' · ');
}
