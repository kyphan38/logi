// ============================================================
// logi — Chọn MỘT dòng cho balance banner.
//
// File thuần, không React → test được bằng `node --test`.
//
// Luật quan trọng nhất: tối đa một dòng. Hiện ba cảnh báo cùng lúc là
// cách nhanh nhất để người dùng học cách phớt lờ cả ba.
// ============================================================

import { deviations, formatDeviation, weekendConflict } from '@/lib/balance';
import type { Activity, Category } from '@/types/logi';

export interface BannerLine {
  /** 'conflict' = OT cuối tuần nuốt Learn. Ưu tiên cao nhất. */
  kind: 'conflict' | 'over' | 'under';
  text: string;
  category: Category | null;
  deltaHours: number;
}

/** Hoa chữ đầu để hợp với nhãn trong app. Không sửa `balance.ts` vì việc này. */
function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * `null` = ẩn hẳn banner. Cố ý không có trạng thái "you're on track":
 * một dòng khen mỗi ngày sẽ dạy mắt bỏ qua đúng chỗ đó trên màn hình,
 * và hôm có cảnh báo thật thì cũng không ai đọc.
 */
export function pickBalance(
  activities: Activity[],
  weekly: Record<Category, number> | null,
  now: number = Date.now()
): BannerLine | null {
  if (!weekly) return null;

  // Xung đột thắng mọi thứ: nó nối hai category lại với nhau nên nói được
  // nhiều hơn bất kỳ con số lệch đơn lẻ nào.
  const conflict = weekendConflict(activities, weekly, now);
  if (conflict) return { kind: 'conflict', text: conflict, category: null, deltaHours: 0 };

  // `deviations()` gọi `expectedHours()` — pro-rate THEO LỊCH, cộng dồn target
  // từng ngày đã qua. Không bao giờ là `weekly × ngày/7`.
  const bad = deviations(activities, weekly, now).filter((d) => d.flag !== 'ok');
  if (bad.length === 0) return null;

  let worst = bad[0];
  for (const d of bad) {
    if (Math.abs(d.deltaHours) > Math.abs(worst.deltaHours)) worst = d;
  }

  return {
    kind: worst.flag === 'over' ? 'over' : 'under',
    text: upperFirst(formatDeviation(worst)),
    category: worst.category,
    deltaHours: worst.deltaHours,
  };
}
