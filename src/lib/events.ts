// ============================================================
// logi - Sự kiện sắp tới (Stage 9).
//
// KHÁC HẲN `@/lib/reminders`. File đó nhắc thói quen hằng ngày, tự suy ra từ
// activity. File này là những mốc người dùng tự gõ vào: đám cưới, hạn nộp,
// lịch khám. Có ngày cụ thể, đếm ngược tới đó, rồi thôi.
//
// File thuần, không React → test được bằng `node --test`.
//
// ĐÂY LÀ BẢN GỐC. `functions/src/events.ts` là bản chép để Cloud Function
// dùng - sửa ở đây thì PHẢI sửa cả bên đó (`test/events-parity.test.ts` giữ
// hai bên khớp nhau).
// ============================================================

import { logicalDate } from '@/lib/balance';
import { MILESTONES, type EventItem, type Milestone } from '@/types/logi';

// ------------------------------------------------------------
// Ngày
// ------------------------------------------------------------

/**
 * "2026-10-15" → mốc epoch của nửa đêm UTC.
 *
 * Cố ý dùng UTC chứ không phải giờ máy: ở đây chỉ cần HIỆU giữa hai ngày, và
 * UTC thì mỗi ngày luôn đúng 24 giờ. Cloud Function chạy ở UTC còn app chạy ở
 * +07:00 - đi qua giờ địa phương là mở cửa cho hai bên lệch nhau một ngày.
 */
function midnightUTC(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * Số ngày từ HÔM NAY (ngày logic) tới `date`. Âm = đã qua.
 *
 * Phải trừ theo ngày lịch, không phải `(target - now) / 86400000`. Trừ theo ms
 * thì lúc 23:00 việc của ngày mai ra 0 ngày - người dùng nhận thông báo
 * "Today" cho một việc còn chưa tới.
 */
export function daysUntil(date: string, now: number): number {
  return daysBetween(logicalDate(now), date);
}

/** Số ngày từ `from` tới `to`. Âm = `to` đã qua. Bản functions chép đúng hàm này. */
export function daysBetween(from: string, to: string): number {
  return Math.round((midnightUTC(to) - midnightUTC(from)) / 86_400_000);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-10-15" → "Wed, Oct 15".
 *
 * Tự ghép chuỗi thay vì `toLocaleDateString()`: hàm đó đọc locale và múi giờ
 * của máy đang chạy, nên cùng một ngày sẽ ra thứ khác nhau giữa app (+07:00)
 * và Cloud Function (UTC).
 */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY[dow]}, ${MONTH[m - 1]} ${d}`;
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

/** "2026-10-15" → "Wednesday". Dùng khi đã có ngày tháng ở chỗ khác. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

// ------------------------------------------------------------
// Chữ đếm ngược
// ------------------------------------------------------------

/**
 * Số ngày → câu đọc được. Dùng CHUNG cho danh sách trong app và cho push,
 * để thông báo trên màn khoá nói đúng câu người dùng sẽ thấy khi mở app.
 *
 * Mốc 7 và 14 nói bằng tuần vì đó là cách người ta thật sự nghĩ về chúng.
 * "In 14 days" bắt não phải chia; "In 2 weeks" thì không.
 */
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

/**
 * Đếm ngược tách làm hai phần, cho khối số to ở đầu mỗi dòng.
 *
 * Phải khớp `countdownText()` từng mốc một: hai chỗ cùng nói về một sự kiện mà
 * một bên ghi "7 days" còn bên kia ghi "Next week" thì người dùng phải dừng lại
 * đối chiếu. `test/events.test.ts` giữ hai hàm này đồng ý với nhau.
 */
export interface CountdownParts {
  /** Số, hoặc chữ "Today" khi không có số nào để hiện. */
  value: string;
  /** Đơn vị. Rỗng khi `value` đã là cả câu. */
  unit: string;
}

export function countdownParts(days: number): CountdownParts {
  if (days < 0) return { value: String(-days), unit: days === -1 ? 'day ago' : 'days ago' };
  if (days === 0) return { value: 'Today', unit: '' };
  if (days === 7) return { value: '1', unit: 'week' };
  if (days === 14) return { value: '2', unit: 'weeks' };
  if (days < 21) return { value: String(days), unit: days === 1 ? 'day' : 'days' };
  if (days < 60) return { value: String(Math.round(days / 7)), unit: 'weeks' };
  return { value: String(Math.round(days / 30)), unit: 'months' };
}

/** Một dòng đầy đủ: "In 3 days · Thu, Oct 15". */
export function eventLine(date: string, now: number): string {
  return `${countdownText(daysUntil(date, now))} · ${dateLabel(date)}`;
}

// ------------------------------------------------------------
// Mốc nhắc
// ------------------------------------------------------------

/**
 * Mốc đến hạn hôm nay mà CHƯA gửi, hoặc `null`.
 *
 * Chỉ khớp ĐÚNG số ngày, không có "gửi bù". Máy tắt mất một ngày thì mốc đó
 * trôi qua luôn: nhận "In 7 days" vào đúng ngày còn 6 ngày là thông báo sai,
 * tệ hơn là không nhận gì.
 */
export function dueMilestone(e: EventItem, now: number): Milestone | null {
  const days = daysUntil(e.date, now);
  if (!isMilestone(days)) return null;
  if (e.notified[String(days)] != null) return null;
  return days;
}

export function isMilestone(days: number): days is Milestone {
  return (MILESTONES as readonly number[]).includes(days);
}

// ------------------------------------------------------------
// Sắp xếp
// ------------------------------------------------------------

/** Mức gấp, để tô màu. Không dính gì tới logic gửi. */
export type Urgency = 'past' | 'today' | 'soon' | 'near' | 'far';

export function urgency(days: number): Urgency {
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= 1) return 'soon';
  if (days <= 3) return 'near';
  return 'far';
}

/**
 * Tách thành hai khối theo đúng thứ tự hiển thị.
 *
 * `upcoming` gần nhất lên đầu - việc sắp tới là việc cần nhìn thấy trước.
 * `past` mới nhất lên đầu, vì việc vừa qua mới là việc còn nhớ.
 */
export function splitEvents(
  list: EventItem[],
  now: number
): { upcoming: EventItem[]; past: EventItem[] } {
  const upcoming: EventItem[] = [];
  const past: EventItem[] = [];
  for (const e of list) (daysUntil(e.date, now) < 0 ? past : upcoming).push(e);
  upcoming.sort((a, b) => cmp(a, b));
  past.sort((a, b) => cmp(b, a));
  return { upcoming, past };
}

/**
 * Ngày → giờ → lúc tạo.
 *
 * Việc cả ngày (`time === null`) đứng TRƯỚC việc có giờ trong cùng ngày: nó
 * không có mốc nào để xếp vào, và đẩy nó xuống cuối ngày là nói sai.
 * Chốt cuối bằng `createdAt` để thứ tự ổn định giữa các lần render.
 */
function cmp(a: EventItem, b: EventItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time ?? '';
  const bt = b.time ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.createdAt - b.createdAt;
}
