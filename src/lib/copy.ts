// ---------------------------------------------------------------------------
// logi - Chữ hiển thị tiếng Anh cho màn Targets (Stage 4.6 Task 6).
//
// Vì sao có file này: hai chuỗi cuối cùng còn tiếng Việt nằm trong
// `logi.ts` (PRESETS[].hint) và `balance.ts` (validateTargets().errors) -
// cả hai đều là file Stage 4.6 CẤM sửa. Nên bản tiếng Anh để ở đây, còn
// LUẬT thì vẫn do balance.ts quyết (`check.ok`), không nhân đôi.
// ---------------------------------------------------------------------------
import {
  CATEGORIES,
  CATEGORY_LABEL,
  HARD_FLOOR,
  TOTAL_BUDGET,
  type Category,
  type PresetId,
} from '@/types/logi';

/** Thay cho PRESETS[id].hint khi hiển thị. */
export const PRESET_HINT: Record<PresetId, string> = {
  normal: 'Standard week',
  crunch: 'Deadline or OT - adds Learn debt',
  deep_learn: 'Certification or exam push',
  recovery: 'Post-crunch reset',
};

/**
 * Cùng ngân sách, cùng sàn với `validateTargets()`, chỉ khác câu chữ.
 * Dùng để HIỂN THỊ; còn cho phép Save hay không thì vẫn hỏi `validateTargets`.
 */
export function budgetMessages(weekly: Record<Category, number>): string[] {
  const out: string[] = [];
  const total = Object.values(weekly).reduce((a, b) => a + b, 0);
  const diff = total - TOTAL_BUDGET;

  if (Math.abs(diff) > 0.1) {
    out.push(
      diff > 0
        ? `Over by ${diff.toFixed(1)}h - reduce another category`
        : `${(-diff).toFixed(1)}h unallocated`,
    );
  }

  for (const c of CATEGORIES) {
    const floor = HARD_FLOOR[c];
    if (floor !== undefined && weekly[c] < floor) {
      out.push(`${CATEGORY_LABEL[c]} can’t go below ${floor}h/week`);
    }
  }
  return out;
}
