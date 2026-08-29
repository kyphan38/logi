// ---------------------------------------------------------------------------
// logi - Bảng DONE / TARGET / LEFT|DIFF bám theo range (AMENDMENT mục 8.2)
//
// Bảng cũ luôn hiện số của HÔM NAY dù người dùng chọn range nào - chọn "Last
// week" mà bảng vẫn kể chuyện hôm nay. Nay bảng đi theo range, và cột thứ ba
// đổi ý nghĩa theo việc khoảng đã đóng hay chưa:
//
//   - Khoảng CHƯA kết thúc → `LEFT` = max(0, target − done). Còn thời gian để làm nốt.
//   - Khoảng ĐÃ đóng      → `DIFF` = done − target, có dấu. Hỏi "còn lại bao
//     nhiêu giờ" ở một tuần đã qua là vô nghĩa.
//
// Target lấy trên CẢ kỳ, không pro-rate: "Hours left this week" phải trừ vào
// target của bảy ngày, không phải của mấy ngày đã trôi qua.
//
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { addDays } from '@/lib/timeline';
import { chipLabel, mondayOf, rangeLabel, type Range } from '@/lib/range';
import { actualForRange, expectedForRange } from '@/lib/range-target';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

/** `left` cho khoảng còn đang diễn ra, `diff` cho khoảng đã đóng. */
export type TailKind = 'left' | 'diff';

export interface RangeTableRow {
  category: Category;
  done: number;
  target: number;
  /** `LEFT` (không âm) hoặc `DIFF` (có dấu), tuỳ `tail`. */
  tail: number;
}

export interface RangeTable {
  title: string;
  tail: TailKind;
  /** Nhãn cột thứ ba, viết hoa sẵn cho UI. */
  tailLabel: string;
  note: string;
  rows: RangeTableRow[];
}

/**
 * Cả kỳ mà range đang đại diện.
 *
 * `this_week` dừng ở hôm nay để chart không báo thiếu oan, nhưng target thì
 * phải tính đủ bảy ngày. `this_month` cũng vậy.
 */
export function fullPeriod(range: Range): Range {
  const closed = (from: string, to: string): Range => ({
    from,
    to,
    kind: range.kind,
    isPartial: false,
  });

  switch (range.kind) {
    case 'this_week': {
      const from = mondayOf(range.from);
      return closed(from, addDays(from, 6));
    }
    case 'this_month': {
      const from = `${range.from.slice(0, 7)}-01`;
      const [y, m] = from.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return closed(from, `${from.slice(0, 7)}-${String(last).padStart(2, '0')}`);
    }
    default:
      return closed(range.from, range.to);
  }
}

/** Kỳ còn đang diễn ra? Chỉ khi đó mới hỏi "còn lại bao nhiêu" được. */
export function isOpenPeriod(range: Range, now: number = Date.now()): boolean {
  return fullPeriod(range).to >= logicalDate(now);
}

function noteFor(range: Range, open: boolean): string {
  switch (range.kind) {
    case 'this_week':
      return 'Hours left this week.';
    case 'this_month':
      return 'Hours left this month.';
    case 'last_week':
      return 'Final numbers for the week.';
    default:
      return open ? 'Hours left in this period.' : 'Final numbers for this period.';
  }
}

export function rangeTable(
  activities: Activity[],
  range: Range,
  weekTargets: Map<string, Record<Category, number>>,
  now: number = Date.now()
): RangeTable {
  const open = isOpenPeriod(range, now);
  const done = actualForRange(activities, range, now);
  const target = expectedForRange(fullPeriod(range), weekTargets, now);

  const rows: RangeTableRow[] = [];
  for (const c of CATEGORIES) {
    const d = done[c];
    const t = target[c];
    // Chỉ giấu khi cả hai đều 0 (VD Work vào một Chủ nhật đơn lẻ). Còn lại luôn
    // hiện đủ để so sánh giữa các category.
    if (d === 0 && t === 0) continue;
    rows.push({ category: c, done: d, target: t, tail: open ? Math.max(0, t - d) : d - t });
  }

  return {
    title: range.kind === 'custom' ? rangeLabel(range) : chipLabel(range.kind),
    tail: open ? 'left' : 'diff',
    tailLabel: open ? 'Left' : 'Diff',
    note: noteFor(range, open),
    rows,
  };
}
