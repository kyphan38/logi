// ---------------------------------------------------------------------------
// logi - Gộp khoảng thành các cột cho stacked bar (Stage 5 Task 4)
//
// 30 cột trên màn 375px không ai đọc được: nhãn chồng lên nhau, mỗi cột rộng
// 5px. Nên quy tắc là cứng:
//   ≤ 14 ngày  → 1 cột / ngày
//   > 14 ngày  → 1 cột / tuần logic
//
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { daysBetween, daysOf, weekOf, weekdayOf, type Range } from '@/lib/range';
import { weekLabel } from '@/lib/week';

/** Quá ngưỡng này thì đổi sang gộp theo tuần. */
export const MAX_DAY_COLUMNS = 14;

export type BucketMode = 'day' | 'week';

export interface Bucket {
  /** Khoá ổn định cho React và cho Recharts. */
  key: string;
  /** Nhãn trục X: "Mon 24" hoặc "W35". */
  label: string;
  /** Khoảng con, dùng lại được với `actualForRange` / `expectedForRange`. */
  range: Range;
  /** Số ngày logic thật sự nằm trong cột (tuần ở hai đầu có thể bị cắt). */
  days: number;
}

export function bucketMode(range: { from: string; to: string }): BucketMode {
  return daysBetween(range.from, range.to) <= MAX_DAY_COLUMNS ? 'day' : 'week';
}

/**
 * Cắt khoảng thành các cột. Tuần ở hai đầu bị cắt theo đúng biên của khoảng -
 * không kéo dài ra ngoài, nếu không cột đầu sẽ trông thấp giả tạo so với target
 * của cả tuần.
 */
export function bucketsOf(range: Range, now: number = Date.now()): Bucket[] {
  const days = daysOf(range);
  const today = logicalDate(now);
  const mode = bucketMode(range);

  const sub = (from: string, to: string): Range => ({
    from,
    to,
    kind: 'custom',
    // Chỉ cột chứa hôm nay mới dở dang, và chỉ khi cả khoảng đang dở dang.
    isPartial: range.isPartial && from <= today && today <= to,
  });

  if (mode === 'day') {
    return days.map((d) => ({
      key: d,
      label: dayLabel(d),
      range: sub(d, d),
      days: 1,
    }));
  }

  const out: Bucket[] = [];
  for (const d of days) {
    const w = weekOf(d);
    const last = out[out.length - 1];
    if (last && last.key === w) {
      last.range = { ...last.range, to: d, isPartial: sub(last.range.from, d).isPartial };
      last.days += 1;
    } else {
      out.push({ key: w, label: weekLabel(w), range: sub(d, d), days: 1 });
    }
  }
  return out;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "2026-08-24" → "Mon 24".
 *
 * Ghép tay chứ không dùng `toLocaleDateString`: locale của máy quyết định thứ
 * tự ("24 Mon" ở nhiều nơi), mà trục X thì phải giống nhau ở mọi máy.
 */
export function dayLabel(date: string): string {
  const [, , d] = date.split('-').map(Number);
  return `${DOW[weekdayOf(date)]} ${d}`;
}
