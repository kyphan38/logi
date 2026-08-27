// ============================================================
// logi — Chuyển tuần (rollover) + ghép nợ vào target
//
// File thuần: KHÔNG import Firestore, KHÔNG React. Test bằng `node --test`.
// `targets.ts` chỉ làm hai việc: đọc dữ liệu vào, ghi kết quả ra.
//
// Không có server cron. Việc chuyển tuần chạy ở client lúc mở app, nên nó
// bắt buộc phải idempotent: mở app hai lần sáng thứ Hai mà cộng nợ hai lần
// thì không crash, không báo gì — chỉ là target Learn phình lên vô lý sau
// vài tuần và không lần ra nguyên nhân.
// ============================================================

import { accrueDebt, applyDebt } from '@/lib/balance';
import { addWeeks, weekDiff } from '@/lib/week';
import {
  CATEGORIES,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type Category,
  type PresetId,
  type WeekTarget,
} from '@/types/logi';

/** Lùi xa hơn 8 tuần thì không dựng lại lịch sử nữa — chỉ đặt lại cột mốc. */
export const MAX_ROLLOVER_WEEKS = 8;

export type DebtBalance = Partial<Record<Category, number>>;
export type Weekly = Record<Category, number>;

// ------------------------------------------------------------
// 1. Trả nợ mà vẫn giữ ngân sách zero-sum
// ------------------------------------------------------------

const sum = (w: Weekly) => CATEGORIES.reduce((a, c) => a + w[c], 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `applyDebt()` CỘNG giờ vào target (Learn +6h) nên tổng vọt lên 141.5h.
 * Nhưng một tuần vẫn chỉ có 135.5h để phân bổ — trả nợ Learn thì phải lấy
 * từ Work hoặc Leisure, không thể lấy từ hư không.
 *
 * Hàm này cùng ý tưởng với `rebalance()` nhưng khoá được NHIỀU category
 * cùng lúc: sleep (cố định) và mọi category vừa được trả nợ.
 * Không sửa `balance.ts`, không đổi cách `applyDebt` tính ra số tiền trả.
 */
export function settleWithinBudget(weekly: Weekly, applied: DebtBalance): Weekly {
  const next = { ...weekly };
  const locked = new Set<Category>(['sleep']);

  for (const c of CATEGORIES) {
    const pay = applied[c] ?? 0;
    if (pay > 0) {
      next[c] += pay;
      locked.add(c);
    }
  }

  const donors = CATEGORIES.filter((c) => !locked.has(c));
  let delta = sum(next) - TOTAL_BUDGET;

  for (let pass = 0; pass < 5 && Math.abs(delta) > 0.01; pass++) {
    const pool = donors.filter((c) => next[c] - (HARD_FLOOR[c] ?? 0) > 0.01 || delta < 0);
    if (!pool.length) break;
    const share = delta / pool.length;
    for (const c of pool) next[c] = Math.max(HARD_FLOOR[c] ?? 0, next[c] - share);
    delta = sum(next) - TOTAL_BUDGET;
  }

  return roundToBudget(next);
}

/**
 * Làm tròn 2 số lẻ rồi dồn phần dư vào category lớn nhất (không phải sleep),
 * để tổng khớp TOTAL_BUDGET tuyệt đối. Thiếu bước này thì
 * `validateTargets()` thỉnh thoảng báo "thừa 0.03h" vì sai số dấu phẩy động.
 */
export function roundToBudget(weekly: Weekly): Weekly {
  const next = {} as Weekly;
  for (const c of CATEGORIES) next[c] = r2(weekly[c]);

  const residual = r2(TOTAL_BUDGET - sum(next));
  if (residual !== 0) {
    const donors = CATEGORIES.filter((c) => c !== 'sleep');
    let best = donors[0];
    for (const c of donors) if (next[c] > next[best]) best = c;
    next[best] = r2(next[best] + residual);
  }
  return next;
}

/**
 * Target của một tuần = preset + phần nợ được trả, kéo về đúng 135.5h.
 * Dùng cho cả `ensureWeekTarget` lẫn `setPreset`.
 */
export function buildWeekly(
  base: Weekly,
  debt: DebtBalance
): { weekly: Weekly; applied: DebtBalance; remaining: DebtBalance } {
  const { applied, remaining } = applyDebt(base, debt);
  return { weekly: settleWithinBudget(base, applied), applied, remaining };
}

/** Cộng `debtApplied` đã ghi sẵn của tuần lên một preset khác. Không tiêu thêm nợ. */
export function reapplyDebt(base: Weekly, debtApplied: DebtBalance): Weekly {
  return settleWithinBudget(base, debtApplied);
}

// ------------------------------------------------------------
// 2. Kế hoạch rollover
// ------------------------------------------------------------

export interface WeekTargetSeed {
  week: string;
  preset: PresetId;
  weekly: Weekly;
  debtApplied: DebtBalance;
}

export interface RolloverState {
  currentWeek: string;
  lastProcessedWeek: string | null;
  debt: DebtBalance;
  /** Đã đọc sẵn trong transaction. Thiếu key = tuần đó không có doc. */
  targets: Partial<Record<string, WeekTarget | null>>;
  now: number;
}

export interface RolloverPlan {
  /** Vì sao ra kế hoạch này — để log và để test đọc cho dễ. */
  reason: 'first-run' | 'same-week' | 'processed' | 'too-far';
  /** Tuần cần đóng sổ hồi tố. */
  locks: string[];
  /** Tuần cần tạo doc mới. */
  creates: WeekTargetSeed[];
  /** `meta/debt` sau cùng. null = không cần ghi. */
  debt: DebtBalance | null;
  /** Cột mốc mới. null = không cần ghi. */
  lastProcessedWeek: string | null;
  /** Các tuần đã đóng sổ và ghi nợ. */
  processed: string[];
  /** Tuần đã trôi qua nhưng không có kế hoạch → không có gì để nợ. */
  skipped: string[];
}

/**
 * Những tuần cần đọc doc trước khi lập kế hoạch.
 * Firestore bắt mọi read phải đứng trước mọi write trong transaction,
 * nên danh sách này phải biết trước.
 */
export function weeksToRead(currentWeek: string, lastProcessedWeek: string | null): string[] {
  const weeks = new Set<string>([currentWeek]);
  if (lastProcessedWeek && lastProcessedWeek !== currentWeek) {
    const gap = weekDiff(lastProcessedWeek, currentWeek);
    if (gap > 0 && gap <= MAX_ROLLOVER_WEEKS) {
      for (let i = 0; i < gap; i++) weeks.add(addWeeks(lastProcessedWeek, i));
    }
  }
  return [...weeks];
}

const NORMAL: Weekly = PRESETS.normal.weekly;

/**
 * Thuần hoàn toàn: cùng input luôn ra cùng output, không đụng đồng hồ.
 *
 * Idempotent nằm ở chỗ `lastProcessedWeek`. Chạy lần hai với state đã cập
 * nhật thì `last === currentWeek` → reason 'same-week' → không ghi gì.
 */
export function planRollover(state: RolloverState): RolloverPlan {
  const { currentWeek, lastProcessedWeek: last } = state;
  const targets = state.targets;

  const empty = (reason: RolloverPlan['reason']): RolloverPlan => ({
    reason,
    locks: [],
    creates: [],
    debt: null,
    lastProcessedWeek: null,
    processed: [],
    skipped: [],
  });

  // Đã chạy cho tuần này rồi. Đây là nhánh chặn cộng nợ hai lần.
  if (last === currentWeek) return empty('same-week');

  const locks: string[] = [];
  const processed: string[] = [];
  const skipped: string[] = [];
  let debt: DebtBalance = { ...state.debt };
  let debtChanged = false;

  const gap = last === null ? 0 : weekDiff(last, currentWeek);
  const reason: RolloverPlan['reason'] =
    last === null ? 'first-run' : gap > MAX_ROLLOVER_WEEKS || gap <= 0 ? 'too-far' : 'processed';

  if (reason === 'processed' && last !== null) {
    // Từng tuần một theo đúng thứ tự. Nhảy thẳng thì nợ của tuần giữa mất hẳn.
    for (let i = 1; i <= gap; i++) {
      const prev = addWeeks(last, i - 1);
      const wt = targets[prev] ?? null;
      if (!wt) {
        // Không mở app tuần đó → không có kế hoạch → không có gì để nợ.
        skipped.push(prev);
        continue;
      }
      if (wt.lockedAt === null) locks.push(prev);
      debt = accrueDebt(wt.weekly, debt);
      debtChanged = true;
      processed.push(prev);
    }
  }

  // Tuần hiện tại: chỉ tạo nếu chưa có. Các tuần trống ở giữa để nguyên —
  // tạo doc giả cho chúng sẽ trừ nợ 50% mỗi tuần và làm loãng crunchStreak.
  const creates: WeekTargetSeed[] = [];
  if (!targets[currentWeek]) {
    const { weekly, applied, remaining } = buildWeekly(NORMAL, debt);
    creates.push({ week: currentWeek, preset: 'normal', weekly, debtApplied: applied });
    if (Object.values(applied).some((v) => (v ?? 0) > 0)) {
      debt = remaining;
      debtChanged = true;
    }
  }

  return {
    reason,
    locks,
    creates,
    debt: debtChanged ? debt : null,
    lastProcessedWeek: currentWeek,
    processed,
    skipped,
  };
}

/** Áp kế hoạch lên state — dùng trong test để chạy hai lần liên tiếp. */
export function applyPlan(state: RolloverState, plan: RolloverPlan): RolloverState {
  const targets = { ...state.targets };
  for (const w of plan.locks) {
    const wt = targets[w];
    if (wt) targets[w] = { ...wt, lockedAt: state.now };
  }
  for (const seed of plan.creates) {
    targets[seed.week] = {
      week: seed.week,
      preset: seed.preset,
      weekly: seed.weekly,
      debtApplied: seed.debtApplied,
      changedAt: state.now,
      lateChange: false,
      lockedAt: null,
    };
  }
  return {
    ...state,
    targets,
    debt: plan.debt ?? state.debt,
    lastProcessedWeek: plan.lastProcessedWeek ?? state.lastProcessedWeek,
  };
}
