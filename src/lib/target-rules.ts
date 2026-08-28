// ============================================================
// logi - Luật thuần của Targets.
//
// Tách khỏi `targets.ts` vì file đó import Firestore. Ở đây không có
// I/O nào, nên `node --test` chạy thẳng được.
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
  // Khoá lười: tuần đã qua 21:00 CN thì coi như đóng, kể cả chưa kịp ghi lockedAt.
  if (isWeekClosed(week, now)) throw new TargetError('locked', WEEK_CLOSED);
}

export function assertValid(weekly: Weekly): void {
  const check = validateTargets(weekly);
  if (!check.ok) throw new TargetError('invalid', check.errors.join(' '));
}

/** Nợ phát sinh nếu đổi sang preset này - để confirm sheet nêu rõ giá phải trả. */
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
    // Nợ ghi theo phần cắt so với BASELINE, không phải so với tuần hiện tại.
    debt: Math.max(0, PRESETS.normal.weekly[c] - next[c]),
  }));
}

export function totalDebt(debt: DebtBalance): number {
  return CATEGORIES.reduce((a, c) => a + (debt[c] ?? 0), 0);
}
