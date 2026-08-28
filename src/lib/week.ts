// ============================================================
// logi - Số học tuần ISO ("2026-W35")
// File thuần: không React, không Firestore. Test bằng `node --test`.
//
// `logicalWeek()` trong balance.ts đi một chiều: ts → "2026-W35".
// Stage 4 cần chiều ngược lại (tuần → mốc thời gian) để lùi/tiến tuần
// và để biết lúc nào là 21:00 Chủ nhật. File này làm việc đó, và luôn
// quay về `logicalWeek()` để đặt tên tuần - không tự đặt tên song song.
// ============================================================

import { logicalWeek, logicalWeekday } from '@/lib/balance';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const WEEK_RE = /^(\d{4})-W(\d{2})$/;

export function isWeekId(week: string): boolean {
  return WEEK_RE.test(week);
}

/**
 * Mốc 12:00 trưa thứ Hai (giờ địa phương) của tuần.
 *
 * Cố ý dùng 12:00 chứ không phải 00:00: ngày logic cắt lúc 04:00, nên
 * 00:00 thứ Hai vẫn thuộc về Chủ nhật - lệch nguyên một tuần.
 */
export function weekStart(week: string): number {
  const m = WEEK_RE.exec(week);
  if (!m) throw new Error(`Bad week id "${week}"`);
  const year = Number(m[1]);
  const n = Number(m[2]);

  // Quy ước ISO: ngày 4 tháng 1 luôn nằm trong tuần 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7; // CN = 7
  const mondayW1 = Date.UTC(year, 0, 4 - (dow - 1));
  const monday = new Date(mondayW1 + (n - 1) * WEEK_MS);

  return new Date(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate(),
    12
  ).getTime();
}

/** "2026-W35" + 1 → "2026-W36". Qua năm vẫn đúng vì đi qua logicalWeek(). */
export function addWeeks(week: string, n: number): string {
  const d = new Date(weekStart(week));
  d.setDate(d.getDate() + n * 7);
  return logicalWeek(d.getTime());
}

/** Số tuần từ `from` tới `to`. Âm nghĩa là `to` ở trước. */
export function weekDiff(from: string, to: string): number {
  return Math.round((weekStart(to) - weekStart(from)) / WEEK_MS);
}

/**
 * 21:00 Chủ nhật của tuần - mốc đóng sổ.
 * Chủ nhật là ngày logic thứ 7 của tuần, tức thứ Hai + 6 ngày.
 */
export function weekLockAt(week: string): number {
  const d = new Date(weekStart(week));
  d.setDate(d.getDate() + 6);
  d.setHours(21, 0, 0, 0);
  return d.getTime();
}

/** Tuần đã qua mốc 21:00 CN chưa. Dùng cho khoá lười lúc mở app. */
export function isWeekClosed(week: string, now: number = Date.now()): boolean {
  return now >= weekLockAt(week);
}

/**
 * Sửa target vào thứ Sáu / thứ Bảy / Chủ nhật → lateChange.
 * Đổi kế hoạch khi tuần đã gần hết thì đó là viết lại lịch sử, không phải lập kế hoạch.
 */
export function isLateChange(now: number = Date.now()): boolean {
  const dow = logicalWeekday(now); // 0 = CN ... 6 = T7
  return dow === 5 || dow === 6 || dow === 0;
}

/** "2026-W35" → "W35". Nhãn ngắn cho card. */
export function weekLabel(week: string): string {
  const m = WEEK_RE.exec(week);
  return m ? `W${m[2]}` : week;
}
