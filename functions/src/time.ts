// ---------------------------------------------------------------------------
// logi functions - Ngày logic (Stage 6 Task 2)
//
// BẢN SAO của quy ước trong `src/lib/balance.ts`. Function chạy tách khỏi app
// nên không import chung được. Đổi quy ước ở app thì PHẢI đổi cả ở đây.
//
// Việt Nam không có giờ mùa hè, nên offset luôn là +07:00 - dùng số cố định
// thay vì Intl, đỡ một tầng có thể sai.
// ---------------------------------------------------------------------------

export const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_CUTOFF_HOUR = 4;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Ngày logic "2026-08-28". Ngày bắt đầu lúc 04:00, không phải nửa đêm. */
export function logicalDate(now: number): string {
  return new Date(now + TZ_OFFSET_MS - DAY_CUTOFF_HOUR * HOUR).toISOString().slice(0, 10);
}

/** Mốc epoch của một giờ trong ngày logic. `markAt('2026-08-28', 6, 15)`. */
export function markAt(date: string, hour: number, minute = 0): number {
  return Date.parse(`${date}T00:00:00Z`) - TZ_OFFSET_MS + hour * HOUR + minute * 60_000;
}

/** Đầu ngày logic = 04:00 giờ địa phương. */
export function dayStart(date: string): number {
  return markAt(date, DAY_CUTOFF_HOUR);
}

/** 0 = Chủ nhật, giống `logicalWeekday()` của app. */
export function logicalWeekday(now: number): number {
  return new Date(`${logicalDate(now)}T00:00:00Z`).getUTCDay();
}

/** Tuần ISO "2026-W35" - phải khớp `logicalWeek()` của app từng ký tự. */
export function logicalWeek(now: number): string {
  const d = new Date(`${logicalDate(now)}T00:00:00Z`);
  // Thứ năm của tuần đó quyết định tuần thuộc về năm nào (quy tắc ISO 8601).
  const day = (d.getUTCDay() + 6) % 7; // 0 = thứ hai
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
