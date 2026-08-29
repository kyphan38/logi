// ---------------------------------------------------------------------------
// logi - Tiến độ hôm nay trên từng nút category (AMENDMENT-remove-sleep 6b)
//
// Chính cái nút là thanh đo. Mỗi nút mang một dải mảnh ở mép dưới: hôm nay đã
// làm bao nhiêu so với target của ĐÚNG ngày đó.
//
// Target KHÔNG pro-rate theo giờ. 9 giờ sáng và 10 giờ tối phải thấy cùng một
// mẫu số, nếu không thì cùng một ô đọc hai lần ra hai nghĩa.
//
// File thuần: không React, không Firestore, không DOM.
// ---------------------------------------------------------------------------
import { dailyTargetFor, gaugeShape } from '@/lib/day-target';
import { actualHours } from '@/lib/balance';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

export interface NowTile {
  category: Category;
  /** Giờ đã log hôm nay (session đang chạy tính tới `now`). */
  actual: number;
  /** Target của đúng thứ trong tuần đó. 0 = ngày này không có target. */
  target: number;
  /** 0..1, không bao giờ quá 1. */
  fill: number;
  /** Vượt target → dải đầy + đoạn hổ phách ở mép phải. */
  over: boolean;
  /** Không có target (VD Work ngày Chủ nhật) → không vẽ dải. */
  noTarget: boolean;
  /** `1.5 / 3.0h`, hoặc `0.0 / -` khi ngày đó không có target. */
  label: string;
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * @param weekly target tuần đang áp dụng. Chưa có (dữ liệu cũ) → mọi nút đều
 *   `noTarget`: thà không hiện dải còn hơn hiện một dải sai.
 * @param weekday 0 = CN … 6 = T7, lấy từ `logicalWeekday()`
 */
export function nowTiles(
  activities: Activity[],
  weekly: Record<Category, number> | null,
  weekday: number,
  now: number = Date.now()
): NowTile[] {
  const actual = actualHours(activities, now);
  const target = weekly ? dailyTargetFor(weekday, weekly) : null;

  return CATEGORIES.map((c) => {
    const a = actual[c] ?? 0;
    const t = target ? target[c] : 0;
    const { fill, over, noTarget } = gaugeShape(a, t);
    return {
      category: c,
      actual: a,
      target: t,
      fill,
      over,
      noTarget,
      label: noTarget ? `${h1(a)} / -` : `${h1(a)} / ${h1(t)}h`,
    };
  });
}
