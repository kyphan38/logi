// ---------------------------------------------------------------------------
// logi - Trend: MỘT category, nhiều kỳ liên tiếp
//
// Khác `bucket.ts`: ở đó các cột được cắt ra từ khoảng đang xem trên màn hình.
// Ở đây cửa sổ tự dựng từ hôm nay lùi về sau, KHÔNG phụ thuộc `RangePicker` -
// câu hỏi "mấy tháng nay Learn đi lên hay đi xuống" không liên quan gì tới
// khoảng đang xem.
//
// Kỳ cuối luôn là kỳ ĐANG chạy và bị đánh dấu `partial`: tuần này mới tới thứ
// Tư thì cột của nó thấp là chuyện đương nhiên, không phải xu hướng.
//
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { daysBetween, weekOf, type Range } from '@/lib/range';
import { addDays } from '@/lib/timeline';
import { addWeeks, weekLabel, weekStart } from '@/lib/week';

export type TrendSpan = '3w' | '6w' | '3m' | '6m';

export const TREND_SPANS: readonly { value: TrendSpan; label: string }[] = [
  { value: '3w', label: 'Last 3 weeks' },
  { value: '6w', label: 'Last 6 weeks' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
];

export const DEFAULT_SPAN: TrendSpan = '6w';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface TrendBucket {
  /** Khoá ổn định cho React/Recharts: "2026-W35" hoặc "2026-08". */
  key: string;
  /** Nhãn trục X: "W35" hoặc "Aug". */
  label: string;
  range: Range;
  /** Kỳ chưa kết thúc - cột thấp không có nghĩa là làm ít. */
  partial: boolean;
}

/** `'3w'` → `{ unit: 'week', count: 3 }`. */
export function spanParts(span: TrendSpan): { unit: 'week' | 'month'; count: number } {
  const count = Number(span.slice(0, -1));
  return { unit: span.endsWith('w') ? 'week' : 'month', count };
}

/** Ngày cuối cùng của tháng chứa `date` ("2026-02" → "2026-02-28"). */
function endOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

/** Lùi `n` tháng từ "2026-08" → "2026-05". */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Các cột của một span, cũ → mới. Cột cuối cùng là kỳ đang chạy.
 *
 * Kỳ đang chạy dừng ở HÔM NAY chứ không kéo tới cuối tuần/cuối tháng: ngày
 * chưa tới thì không có dữ liệu, mà target vẫn cộng đủ → cột sẽ trông hụt.
 */
export function trendBuckets(span: TrendSpan, now: number = Date.now()): TrendBucket[] {
  const today = logicalDate(now);
  const { unit, count } = spanParts(span);
  const out: TrendBucket[] = [];

  if (unit === 'week') {
    const current = weekOf(today);
    for (let i = count - 1; i >= 0; i--) {
      const w = addWeeks(current, -i);
      const from = logicalDate(weekStart(w));
      const last = addDays(from, 6);
      const partial = i === 0;
      out.push({
        key: w,
        label: weekLabel(w),
        range: { from, to: partial ? today : last, kind: 'custom', isPartial: partial },
        partial,
      });
    }
    return out;
  }

  const currentMonth = today.slice(0, 7);
  for (let i = count - 1; i >= 0; i--) {
    const ym = addMonths(currentMonth, -i);
    const partial = i === 0;
    out.push({
      key: ym,
      label: MONTH[Number(ym.slice(5, 7)) - 1],
      range: {
        from: `${ym}-01`,
        to: partial ? today : endOfMonth(ym),
        kind: 'custom',
        isPartial: partial,
      },
      partial,
    });
  }
  return out;
}

/** Cửa sổ bao cả span - MỘT query duy nhất cho mọi cột. */
export function trendWindow(buckets: TrendBucket[]): { from: string; to: string } {
  return { from: buckets[0].range.from, to: buckets[buckets.length - 1].range.to };
}

/**
 * Bao nhiêu phần của kỳ đang chạy đã trôi qua, 0..1.
 * Dùng để nói "tuần này mới đi được 3/7" chứ không dùng để phóng to cột lên -
 * ngoại suy là bịa số.
 */
export function elapsedFraction(b: TrendBucket, now: number = Date.now()): number {
  if (!b.partial) return 1;
  const [y, m] = b.range.from.split('-').map(Number);
  // Tuần luôn 7 ngày; tháng thì hỏi lịch (ngày 0 của tháng sau = ngày cuối).
  const full = b.key.includes('W') ? 7 : new Date(y, m, 0).getDate();
  return Math.min(1, daysBetween(b.range.from, logicalDate(now)) / full);
}
