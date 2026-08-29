// ---------------------------------------------------------------------------
// logi - Heatmap 24h × ngày (Stage 5 Task 5, sửa bởi AMENDMENT sleep-boundary)
//
// Trả lời "KHI NÀO", không phải "BAO NHIÊU" - bao nhiêu đã có ở balance bars.
//
// Cột = ngày LỊCH, hàng = giờ đồng hồ THẬT (00:00 → 23:00). Ô được tô theo lúc
// việc đó thực sự diễn ra, bất kể record thuộc `logicalDate` nào: ngủ 00:15 →
// 07:30 thứ Ba tô các ô 00:00–07:00 của cột thứ Ba.
//
// Vì vậy heatmap và tổng giờ theo category KHÔNG khớp nhau ở những ngày ngủ
// muộn. Đó là đúng: tổng giờ tính theo ngày logic (mốc 04:00), còn heatmap
// tính theo giờ đồng hồ. Hai câu hỏi khác nhau.
//
// KHÔNG co giãn hàng như timeline của History: ở đây mọi giờ phải cao bằng
// nhau thì mắt mới so được "8h sáng hôm nay" với "8h sáng hôm qua".
//
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import { daysBetween, daysOf, type Range } from '@/lib/range';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

/** Quá 14 ngày thì ô hẹp hơn 3px - vô nghĩa. */
export const MAX_HEATMAP_DAYS = 14;

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

/** "2026-08-25" → 00:00 giờ địa phương. */
function startOfCalendarDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Date → "2026-08-25" (ngày lịch, không phải ngày logic). */
function dayKey(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface Cell {
  /** Category chiếm nhiều phút nhất trong giờ đó. null = không log gì. */
  category: Category | null;
  /** Số phút đã log của category thắng, 0..60. */
  minutes: number;
}

export interface Heatmap {
  /** Ngày LỊCH, theo thứ tự cột trái → phải. */
  days: string[];
  /** Nhãn hàng: "00:00" … "23:00". */
  hours: string[];
  /** grid[hàng][cột] - hàng 0 là 00:00. */
  grid: Cell[][];
}

export function heatmapFits(range: { from: string; to: string }): boolean {
  return daysBetween(range.from, range.to) <= MAX_HEATMAP_DAYS;
}

export function heatmapOf(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): Heatmap {
  const days = daysOf(range);
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  // Phút của từng category cho từng ô, trước khi chọn ra người thắng.
  const acc: Record<Category, number>[][] = Array.from({ length: 24 }, () =>
    days.map(() => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>)
  );

  const colOf = new Map(days.map((d, i) => [d, i]));
  // Cột cuối đóng lúc 24:00 của ngày lịch đó, không phải 04:00 hôm sau.
  const limit = Math.min(startOfCalendarDay(days[days.length - 1]) + 24 * HOUR_MS, now);
  const first = startOfCalendarDay(days[0]);

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;

    const from = Math.max(a.startAt, first);
    const to = Math.min(a.endAt ?? now, limit);
    if (to <= from) continue;

    // Đi từng ô một giờ theo giờ đồng hồ thật - vắt qua nửa đêm là chuyện
    // bình thường, chỉ là sang cột kế bên.
    let t = from;
    while (t < to) {
      const d = new Date(t);
      const cellStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
      const cellEnd = cellStart + HOUR_MS;
      const col = colOf.get(dayKey(d));
      if (col !== undefined) {
        const overlap = Math.min(to, cellEnd) - t;
        if (overlap > 0) acc[d.getHours()][col][a.category] += overlap / MIN_MS;
      }
      t = cellEnd;
    }
  }

  const grid = acc.map((rowCats) =>
    rowCats.map((cats) => {
      let best: Category | null = null;
      let bestMin = 0;
      for (const c of CATEGORIES) {
        // `>` chứ không `>=`: hoà thì giữ người đầu tiên theo thứ tự CATEGORIES,
        // để cùng dữ liệu luôn ra cùng một màu.
        if (cats[c] > bestMin) {
          best = c;
          bestMin = cats[c];
        }
      }
      return { category: best, minutes: bestMin };
    })
  );

  return { days, hours, grid };
}
