// ---------------------------------------------------------------------------
// logi — Heatmap 24h × ngày (Stage 5 Task 5)
//
// Trả lời "KHI NÀO", không phải "BAO NHIÊU" — bao nhiêu đã có ở balance bars.
//
// Hàng đi từ 04:00 → 04:00 hôm sau, đúng biên của ngày logic. Nếu để 00:00 thì
// giấc ngủ 22:00–06:00 sẽ bị cắt làm đôi và nằm ở hai cột khác nhau.
//
// KHÔNG co giãn hàng như timeline của History: ở đây mọi giờ phải cao bằng
// nhau thì mắt mới so được "8h sáng hôm nay" với "8h sáng hôm qua".
//
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import { daysBetween, daysOf, type Range } from '@/lib/range';
import { dayWindow } from '@/lib/timeline';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

/** Quá 14 ngày thì ô hẹp hơn 3px — vô nghĩa. */
export const MAX_HEATMAP_DAYS = 14;

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

export interface Cell {
  /** Category chiếm nhiều phút nhất trong giờ đó. null = không log gì. */
  category: Category | null;
  /** Số phút đã log của category thắng, 0..60. */
  minutes: number;
}

export interface Heatmap {
  /** Ngày logic, theo thứ tự cột trái → phải. */
  days: string[];
  /** Nhãn hàng: "04:00" … "03:00". */
  hours: string[];
  /** grid[hàng][cột] — hàng 0 là 04:00. */
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
  const hours = Array.from({ length: 24 }, (_, i) => `${String((i + 4) % 24).padStart(2, '0')}:00`);

  // Phút của từng category cho từng ô, trước khi chọn ra người thắng.
  const acc: Record<Category, number>[][] = Array.from({ length: 24 }, () =>
    days.map(() => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>)
  );

  const colOf = new Map(days.map((d, i) => [d, i]));
  const winEnd = Math.min(dayWindow(range.to).end, now);

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;

    const s = a.startAt;
    const e = Math.min(a.endAt ?? now, winEnd);
    if (e <= s) continue;

    // Đi theo từng cột: một session có thể vắt qua nhiều ngày logic.
    for (const [d, col] of colOf) {
      const win = dayWindow(d);
      const from = Math.max(s, win.start);
      const to = Math.min(e, win.end, winEnd);
      if (to <= from) continue;

      const firstRow = Math.floor((from - win.start) / HOUR_MS);
      const lastRow = Math.ceil((to - win.start) / HOUR_MS) - 1;

      for (let row = firstRow; row <= lastRow && row < 24; row++) {
        const cellStart = win.start + row * HOUR_MS;
        const overlap = Math.min(to, cellStart + HOUR_MS) - Math.max(from, cellStart);
        if (overlap > 0) acc[row][col][a.category] += overlap / MIN_MS;
      }
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
