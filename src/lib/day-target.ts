// ---------------------------------------------------------------------------
// logi - Target của MỘT ngày (Stage 4.5)
//
// `expectedHours()` trong balance.ts cộng dồn cả tuần đã trôi qua. History chỉ
// cần lát cắt một ngày. File này giữ đúng công thức đó, không đổi đi:
//
//     target[c][dow] = BASELINE_DAILY[c][dow] * (weekly[c] / BASELINE_WEEKLY[c])
//
// tức là giữ nguyên hình dạng tuần của baseline rồi scale theo target thực tế.
// Hàm thuần, không đụng React → test bằng `node --test`.
// ---------------------------------------------------------------------------
import { catchUp } from '@/lib/catchup';
import { BASELINE_DAILY, BASELINE_WEEKLY, CATEGORIES, type Category } from '@/types/logi';

/**
 * @param weekday 0 = CN … 6 = T7 (khớp `logicalWeekday()`)
 * @param weekly  target tuần đang áp dụng (từ `weekTarget.weekly`)
 */
export function dailyTargetFor(
  weekday: number,
  weekly: Record<Category, number>
): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    const base = BASELINE_WEEKLY[c];
    const scale = base > 0 ? weekly[c] / base : 0;
    out[c] = BASELINE_DAILY[c][weekday] * scale;
  }
  return out;
}

/** Dưới mức này thì nhãn được làm đậm hơn cho dễ thấy. Không dùng màu đỏ. */
export const LOW_RATIO = 0.5;

export interface DayLine {
  category: Category;
  actual: number;
  /** Mẫu số của gauge. Có `doneBefore` thì đây là gợi ý bù, không thì standard. */
  target: number;
  /** Chia theo baseline, không nhìn tuần đã đi tới đâu. */
  standard: number;
  /** Xong target tuần rồi, trước cả ngày này. */
  met: boolean;
  /** Trần ngày đã cắt bớt gợi ý. */
  capped: boolean;
  /** actual < 50% target → cần chú ý. */
  low: boolean;
}

/**
 * Dòng tóm tắt: `Learn 1.5 / 3.0 · Work 9.5 / 9.5`.
 *
 * @param doneBefore giờ đã log ở các ngày TRƯỚC ngày này trong cùng tuần logic.
 *   Có thì mẫu số là gợi ý bù (xem `catchUp`); `null` - chưa tải xong dữ liệu
 *   tuần - thì quay về chia theo baseline, thà đứng yên còn hơn nhảy số.
 */
export function daySummary(
  actual: Record<Category, number>,
  weekly: Record<Category, number> | null,
  weekday: number,
  doneBefore: Record<Category, number> | null = null
): DayLine[] {
  if (!weekly) return [];

  const flat = dailyTargetFor(weekday, weekly);
  const plan = doneBefore ? catchUp(weekly, doneBefore, weekday) : null;

  const lines: DayLine[] = [];
  for (const c of CATEGORIES) {
    const a = actual[c] ?? 0;
    const standard = flat[c];
    const target = plan ? plan[c].suggested : standard;

    // Ngày nghỉ của category này (Fitness Chủ nhật) mà cũng chẳng log gì thì ô
    // đó không mang tin - bỏ hẳn. Đã log thì vẫn hiện, để giờ không biến mất.
    if (a <= 0 && standard <= 0 && target <= 0) continue;

    lines.push({
      category: c,
      actual: a,
      target,
      standard,
      met: plan?.[c].met ?? false,
      capped: plan?.[c].capped ?? false,
      low: target > 0 && a < target * LOW_RATIO,
    });
  }
  return lines;
}


// ---------------------------------------------------------------------------
// Hình dạng một ô gauge ở màn History (Stage 4.6 Task 4).
// Tách ra khỏi component để test được bằng `node --test`.
// ---------------------------------------------------------------------------
export interface GaugeShape {
  /** 0..1 - phần thanh được tô. Không bao giờ quá 1. */
  fill: number;
  /** Vượt target → thanh đầy + vạch hổ phách ở mép phải. */
  over: boolean;
  /** Không có target (VD Fitness ngày Chủ nhật) → không vẽ thanh, số là `0.0/-`. */
  noTarget: boolean;
  /** Không target mà cũng chẳng log gì → ô này không mang tin, làm mờ đi. */
  dim: boolean;
}

export function gaugeShape(actual: number, target: number): GaugeShape {
  const noTarget = target <= 0;
  return {
    // Kẹp cả hai đầu: width âm là CSS không hợp lệ, thanh sẽ biến mất.
    fill: noTarget ? 0 : Math.min(1, Math.max(0, actual / target)),
    over: !noTarget && actual > target,
    noTarget,
    dim: noTarget && actual <= 0,
  };
}
