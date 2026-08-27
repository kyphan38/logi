// ---------------------------------------------------------------------------
// logi — Target của MỘT ngày (Stage 4.5)
//
// `expectedHours()` trong balance.ts cộng dồn cả tuần đã trôi qua. History chỉ
// cần lát cắt một ngày. File này giữ đúng công thức đó, không đổi đi:
//
//     target[c][dow] = BASELINE_DAILY[c][dow] * (weekly[c] / BASELINE_WEEKLY[c])
//
// tức là giữ nguyên hình dạng tuần của baseline rồi scale theo target thực tế.
// Hàm thuần, không đụng React → test bằng `node --test`.
// ---------------------------------------------------------------------------
import { dayProgress } from '@/lib/balance';
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
  target: number;
  /** actual < 50% target → cần chú ý. */
  low: boolean;
}

/**
 * Dòng tóm tắt: `Learn 1.5 / 3.0 · Work 9.5 / 9.5`.
 *
 * @param progress phần ngày đã trôi qua, 0..1. Ngày đã qua truyền 1; ngày hôm
 *   nay truyền `dayProgress(now)` — 10 giờ sáng mà so với target cả ngày thì
 *   cái gì cũng "thiếu".
 */
export function daySummary(
  actual: Record<Category, number>,
  weekly: Record<Category, number> | null,
  weekday: number,
  progress = 1
): DayLine[] {
  if (!weekly) return [];
  const full = dailyTargetFor(weekday, weekly);

  const lines: DayLine[] = [];
  for (const c of CATEGORIES) {
    const a = actual[c] ?? 0;
    const target = full[c] * Math.min(1, Math.max(0, progress));
    // Chủ nhật không có Fitness thì không hiện Fitness.
    if (a <= 0 && full[c] <= 0) continue;
    lines.push({ category: c, actual: a, target, low: target > 0 && a < target * LOW_RATIO });
  }
  return lines;
}

/** Target hôm nay đã pro-rate. Ngày khác thì `progress` = 1. */
export function progressFor(selected: string, today: string, now: number): number {
  return selected === today ? dayProgress(now) : 1;
}
