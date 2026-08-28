// ---------------------------------------------------------------------------
// logi - Khoảng thời gian cho Analytics (Stage 5 Task 1)
//
// File thuần: không React, không Firestore → test bằng `node --test`.
//
// Mọi mốc ngày đi qua `logicalDate()` (cắt 04:00). "Today" lúc 02:00 sáng là
// ngày HÔM TRƯỚC - nếu dùng ngày lịch thô thì mọi số sau nửa đêm đều sai.
// ---------------------------------------------------------------------------
import { dayProgress, logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import { addDays } from '@/lib/timeline';
import { addWeeks, weekStart } from '@/lib/week';

export type RangeKind = 'today' | 'this_week' | 'last_week' | 'this_month' | 'custom';

export interface Range {
  /** logicalDate, "2026-08-24". */
  from: string;
  /** logicalDate, bao gồm cả ngày này. */
  to: string;
  kind: RangeKind;
  /**
   * `to` là hôm nay và ngày chưa kết thúc.
   * Cờ này quyết định có pro-rate target hay không. Thiếu nó thì "This week"
   * vào thứ Ba sẽ luôn báo thiếu mọi thứ.
   */
  isPartial: boolean;
}

/** Quá mốc này thì chặn - query nặng mà chart cũng không đọc nổi. */
export const MAX_RANGE_DAYS = 92;

export const RANGE_TOO_LARGE = 'Range too large - max 3 months.';

/** Số tuần tối đa còn dùng được query `logicalWeek in [...]` (Firestore cho 30). */
export const MAX_WEEKS_IN_QUERY = 4;

// ---------------------------------------------------------------------------
// Chuyển đổi ngày logic ↔ mốc thời gian
// ---------------------------------------------------------------------------

/**
 * Mốc 12:00 trưa của một ngày logic.
 * Cố ý dùng giữa ngày, không dùng 00:00: nửa đêm thuộc về ngày logic TRƯỚC đó.
 */
export function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** Ngày logic → tuần ISO của nó. */
export function weekOf(date: string): string {
  return logicalWeek(noonOf(date));
}

/** Ngày logic → thứ trong tuần. 0 = CN … 6 = T7. */
export function weekdayOf(date: string): number {
  return logicalWeekday(noonOf(date));
}

/** Số ngày từ `from` tới `to`, tính cả hai đầu. `to` trước `from` → 0. */
export function daysBetween(from: string, to: string): number {
  const ms = noonOf(to) - noonOf(from);
  if (ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

/** Danh sách ngày logic trong khoảng, đã sắp xếp tăng dần. */
export function daysOf(range: { from: string; to: string }): string[] {
  const out: string[] = [];
  const n = daysBetween(range.from, range.to);
  for (let i = 0; i < n; i++) out.push(addDays(range.from, i));
  return out;
}

/** Các tuần logic mà khoảng chạm tới, không trùng lặp, theo thứ tự. */
export function weeksOf(range: { from: string; to: string }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Đi theo tuần chứ không theo ngày: khoảng 92 ngày chỉ tốn ~14 vòng lặp.
  let w = weekOf(range.from);
  const last = weekOf(range.to);
  for (let guard = 0; guard < 100; guard++) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (w === last) break;
    w = addWeeks(w, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dựng khoảng từ chip
// ---------------------------------------------------------------------------

/** Thứ Hai của tuần logic chứa `date`. */
export function mondayOf(date: string): string {
  return logicalDate(weekStart(weekOf(date)));
}

function partial(to: string, now: number): boolean {
  return to === logicalDate(now) && dayProgress(now) < 1;
}

/**
 * Chip → khoảng cụ thể.
 *
 * `this_week` và `this_month` kết thúc ở HÔM NAY, không phải cuối tuần/cuối
 * tháng: ngày tương lai chưa có dữ liệu, mà target thì vẫn cộng đủ → chart sẽ
 * báo thiếu oan mỗi thứ Ba.
 */
export function buildRange(kind: Exclude<RangeKind, 'custom'>, now: number = Date.now()): Range {
  const today = logicalDate(now);

  switch (kind) {
    case 'today':
      return { from: today, to: today, kind, isPartial: partial(today, now) };

    case 'this_week': {
      const from = mondayOf(today);
      return { from, to: today, kind, isPartial: partial(today, now) };
    }

    case 'last_week': {
      const w = addWeeks(weekOf(today), -1);
      const from = logicalDate(weekStart(w));
      // Tuần trước luôn đã đóng → không bao giờ pro-rate.
      return { from, to: addDays(from, 6), kind, isPartial: false };
    }

    case 'this_month': {
      const from = `${today.slice(0, 7)}-01`;
      return { from, to: today, kind, isPartial: partial(today, now) };
    }
  }
}

export interface CustomResult {
  range: Range | null;
  /** Câu lỗi để hiện thẳng lên UI. `null` là hợp lệ. */
  error: string | null;
}

/** Khoảng do người dùng chọn. Tự đảo nếu chọn ngược, chặn khi quá dài. */
export function customRange(from: string, to: string, now: number = Date.now()): CustomResult {
  if (!from || !to) return { range: null, error: 'Pick both dates.' };

  // Chọn ngược thì sửa hộ, không bắt lỗi - người dùng chỉ bấm nhầm thứ tự.
  const [a, b] = noonOf(from) <= noonOf(to) ? [from, to] : [to, from];

  if (daysBetween(a, b) > MAX_RANGE_DAYS) return { range: null, error: RANGE_TOO_LARGE };

  return {
    range: { from: a, to: b, kind: 'custom', isPartial: partial(b, now) },
    error: null,
  };
}

/** `Last 7 days` / `Last 30 days` - n ngày tính cả hôm nay. */
export function lastNDays(n: number, now: number = Date.now()): Range {
  const today = logicalDate(now);
  return {
    from: addDays(today, -(n - 1)),
    to: today,
    kind: 'custom',
    isPartial: partial(today, now),
  };
}

// ---------------------------------------------------------------------------
// Chiến lược query - MỘT query cho cả khoảng
// ---------------------------------------------------------------------------

export type QueryPlan =
  | { mode: 'weeks'; weeks: string[] }
  | { mode: 'dates'; from: string; to: string };

/**
 * Khoảng gọn trong 1–4 tuần → `logicalWeek in [...]` (dùng index sẵn có, và
 * trùng với cache của các màn khác). Dài hơn → range trên `logicalDate`.
 *
 * Không bao giờ query từng ngày một.
 */
export function queryPlan(range: { from: string; to: string }): QueryPlan {
  const weeks = weeksOf(range);
  if (weeks.length <= MAX_WEEKS_IN_QUERY) return { mode: 'weeks', weeks };
  return { mode: 'dates', from: range.from, to: range.to };
}

/** Query theo tuần lấy dư ở hai đầu → lọc lại theo ngày logic. */
export function inRange(logicalDateOf: string, range: { from: string; to: string }): boolean {
  return logicalDateOf >= range.from && logicalDateOf <= range.to;
}

// ---------------------------------------------------------------------------
// Nhãn
// ---------------------------------------------------------------------------

const CHIP_LABEL: Record<RangeKind, string> = {
  today: 'Today',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  custom: 'Custom',
};

export function chipLabel(kind: RangeKind): string {
  return CHIP_LABEL[kind];
}

function pretty(date: string): string {
  return new Date(noonOf(date)).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** "Aug 24 – Aug 26" · một ngày thì chỉ "Aug 26". */
export function rangeLabel(range: { from: string; to: string }): string {
  return range.from === range.to ? pretty(range.from) : `${pretty(range.from)} – ${pretty(range.to)}`;
}
