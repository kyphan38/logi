// ---------------------------------------------------------------------------
// logi - English display text for the Targets screen.
//
// The rules live in balance.ts; this file only reuses them for display,
// so the wording cannot drift from the logic.
// ---------------------------------------------------------------------------
import {
  PRESETS,
  type Category,
  type PresetId,
} from '@/types/logi';
import { validateTargets } from '@/lib/balance';

/** Used instead of PRESETS[id].hint for display. */
export const PRESET_HINT: Record<PresetId, string> = {
  normal: PRESETS.normal.hint,
  crunch: PRESETS.crunch.hint,
  deep_learn: PRESETS.deep_learn.hint,
  recovery: PRESETS.recovery.hint,
};

/**
 * For DISPLAY; whether Save is allowed is still asked of `validateTargets`.
 */
export function budgetMessages(weekly: Record<Category, number>): string[] {
  return validateTargets(weekly).errors;
}
