// ============================================================
// logi - Chọn MỘT dòng cho balance banner.
//
// File thuần, không React → test được bằng `node --test`.
//
// Luật quan trọng nhất: tối đa một dòng. Hiện ba cảnh báo cùng lúc là
// cách nhanh nhất để người dùng học cách phớt lờ cả ba.
// ============================================================

import {
  actualHours,
  deviations,
  expectedHours,
  logicalWeekday,
  weekendConflict,
} from '@/lib/balance';
import type { Deviation } from '@/lib/balance';
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

export interface BannerLine {
  /** 'conflict' = OT cuối tuần nuốt Learn. Ưu tiên cao nhất.
   *  'sparse'   = tuần gần như trống, chưa đủ dữ liệu để so sánh. */
  kind: 'conflict' | 'over' | 'under' | 'sparse';
  text: string;
  category: Category | null;
  deltaHours: number;
}

/**
 * Dưới ngần này thì mọi category đều ra -99% và banner chỉ gây nản chứ không
 * mang tin. Đầu tuần hay tuần mới nghỉ phép đều rơi vào đây.
 */
export const MIN_LOGGED_RATIO = 0.2;

/**
 * Đã log được bao nhiêu phần so với lượng lẽ ra phải có TỚI LÚC NÀY.
 *
 * Mẫu số là target của chính người dùng, không phải 24h/ngày - nên nó vẫn có
 * nghĩa sau khi bỏ Sleep, khác với hàm chia cứng cho 168h đã xoá (mục 3.2).
 */
export function loggedRatio(
  activities: Activity[],
  weekly: Record<Category, number>,
  now: number = Date.now()
): number {
  const exp = expectedHours(weekly, now);
  const act = actualHours(activities, now);
  const total = CATEGORIES.reduce((a, c) => a + exp[c], 0);
  if (total <= 0) return 1; // chưa tới hạn nào cả → đừng vì thế mà giấu banner
  return CATEGORIES.reduce((a, c) => a + (act[c] ?? 0), 0) / total;
}

/**
 * `Work 0.4h · 31.0h expected by now (-99%)`
 *
 * KHÔNG dùng `formatDeviation()` của `balance.ts`: nó viết `0.4h / 31.0h`, mà
 * dấu `/` khiến 31.0h đọc lên như thể đó là target tuần của Work - trong khi
 * màn Targets ghi 40h. `balance.ts` là file cấm sửa nên đổi cách viết ở đây.
 */
function phrase(d: Deviation): string {
  const label = CATEGORY_LABEL[d.category];
  const sign = d.deltaHours > 0 ? '+' : '';
  const pct = Math.round(d.deltaPct * 100);
  return `${label} ${d.actual.toFixed(1)}h · ${d.expected.toFixed(1)}h expected by now (${sign}${pct}%)`;
}

/** `Weekend OT: 8.0h. Learn is 12.0h short of its 31h target.` */
function conflictPhrase(
  activities: Activity[],
  weekly: Record<Category, number>,
  now: number
): string {
  const weekend = activities.filter((a) => [0, 6].includes(logicalWeekday(a.startAt)));
  const otWork = actualHours(weekend, now).work;
  const gap = weekly.learn - actualHours(activities, now).learn;
  return `Weekend OT: ${otWork.toFixed(1)}h. Learn is ${gap.toFixed(1)}h short of its ${weekly.learn}h target.`;
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

  // Tuần gần như trống: nói thẳng là chưa đủ dữ liệu, đừng bắn -99% vào mặt
  // người dùng. Kiểm tra TRƯỚC conflict vì conflict cũng vô nghĩa khi trống.
  if (loggedRatio(activities, weekly, now) < MIN_LOGGED_RATIO) {
    return {
      kind: 'sparse',
      text: 'Not enough logged this week to compare.',
      category: null,
      deltaHours: 0,
    };
  }

  // Xung đột thắng mọi thứ: nó nối hai category lại với nhau nên nói được
  // nhiều hơn bất kỳ con số lệch đơn lẻ nào.
  // LUẬT vẫn do balance.ts quyết; ở đây chỉ viết lại câu cho ra tiếng Anh,
  // vì Stage 4.6 cấm sửa balance.ts.
  if (weekendConflict(activities, weekly, now)) {
    return {
      kind: 'conflict',
      text: conflictPhrase(activities, weekly, now),
      category: null,
      deltaHours: 0,
    };
  }

  // `deviations()` gọi `expectedHours()` - pro-rate THEO LỊCH, cộng dồn target
  // từng ngày đã qua. Không bao giờ là `weekly × ngày/7`.
  const bad = deviations(activities, weekly, now).filter((d) => d.flag !== 'ok');
  if (bad.length === 0) return null;

  let worst = bad[0];
  for (const d of bad) {
    if (Math.abs(d.deltaHours) > Math.abs(worst.deltaHours)) worst = d;
  }

  return {
    kind: worst.flag === 'over' ? 'over' : 'under',
    text: phrase(worst),
    category: worst.category,
    deltaHours: worst.deltaHours,
  };
}
