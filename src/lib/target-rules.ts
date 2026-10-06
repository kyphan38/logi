// ============================================================
// logi - Pure Targets rules.
//
// Separate from `targets.ts` because that file imports Firestore. No I/O
// here, so `node --test` runs it directly.
// ============================================================

import { validateTargets } from '@/lib/balance';
import { reapplyDebt, type DebtBalance, type Weekly } from '@/lib/rollover';
import { isWeekClosed } from '@/lib/week';
import { CATEGORIES, PRESETS, type Category, type PresetId, type WeekTarget } from '@/types/logi';

export class TargetError extends Error {
  code: 'locked' | 'invalid';
  constructor(code: 'locked' | 'invalid', message: string) {
    super(message);
    this.name = 'TargetError';
    this.code = code;
  }
}

export const WEEK_CLOSED = 'This week is closed';

export function assertOpen(wt: WeekTarget | null, week: string, now: number): void {
  if (wt && wt.lockedAt !== null) throw new TargetError('locked', WEEK_CLOSED);
  // Lazy lock: a week past 21:00 Sunday counts as closed, even before lockedAt is written.
  if (isWeekClosed(week, now)) throw new TargetError('locked', WEEK_CLOSED);
}

export function assertValid(weekly: Weekly): void {
  const check = validateTargets(weekly);
  if (!check.ok) throw new TargetError('invalid', check.errors.join(' '));
}

/** Debt created by switching to this preset - so the confirm sheet shows the cost. */
export function previewSwitch(
  from: Weekly,
  toPreset: PresetId,
  debtApplied: DebtBalance
): { category: Category; from: number; to: number; debt: number }[] {
  const next = reapplyDebt(PRESETS[toPreset].weekly, debtApplied);
  return CATEGORIES.map((c) => ({
    category: c,
    from: from[c],
    to: next[c],
    // Debt is recorded against the BASELINE cut, not against the current week.
    debt: Math.max(0, PRESETS.normal.weekly[c] - next[c]),
  }));
}

export function totalDebt(debt: DebtBalance): number {
  return CATEGORIES.reduce((a, c) => a + (debt[c] ?? 0), 0);
}
