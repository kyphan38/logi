// ---------------------------------------------------------------------------
// logi functions - Sự kiện sắp tới (Stage 9)
//
// BẢN SAO của `src/lib/events.ts`. Function chạy tách khỏi app nên không
// import chung được. Đổi câu chữ hay mốc ở app thì PHẢI đổi cả ở đây.
//
// `test/events-parity.test.ts` so hai bản với nhau trên hàng nghìn đầu vào -
// đó là thứ duy nhất giữ chúng không trôi khỏi nhau. Để so được, file này
// KHÔNG import gì cả: `daysBetween()` nhận ngày hôm nay làm tham số thay vì
// tự gọi `logicalDate()`.
// ---------------------------------------------------------------------------

export const MILESTONES = [14, 7, 3, 1, 0] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Nửa đêm UTC. Xem ghi chú ở bản app - cố ý KHÔNG dùng giờ địa phương. */
function midnightUTC(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Số ngày từ `from` tới `to`. Âm = `to` đã qua. */
export function daysBetween(from: string, to: string): number {
  return Math.round((midnightUTC(to) - midnightUTC(from)) / 86_400_000);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-15" → "Wed, Oct 15". Không đụng locale/múi giờ của máy chạy. */
export function dateLabel(date: string): string {
  const parts = date.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return date;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY[dow]}, ${MONTH[m - 1]} ${d}`;
}

/** Số ngày → câu đọc được. Phải khớp từng ký tự với bản app. */
export function countdownText(days: number): string {
  if (days < 0) return days === -1 ? 'Yesterday' : `${-days} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === 7) return 'Next week';
  if (days === 14) return 'In 2 weeks';
  if (days < 21) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

export function isMilestone(days: number): days is Milestone {
  return (MILESTONES as readonly number[]).includes(days);
}

/**
 * Ngày + giờ thành một câu: "Mon, Oct 26 · 11:30", hoặc chỉ ngày khi cả ngày.
 *
 * Giờ giữ nguyên dạng 24 tiếng đã lưu, KHÔNG qua `toLocaleTimeString()`: hàm
 * đó đọc locale máy chạy, nên Cloud Function (UTC, locale mặc định) sẽ in ra
 * một kiểu còn app in ra kiểu khác.
 */
export function whenLabel(date: string, time: string | null): string {
  return time ? `${dateLabel(date)} · ${time}` : dateLabel(date);
}
