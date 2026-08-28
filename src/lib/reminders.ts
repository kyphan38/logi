// ============================================================
// logi - Nhắc trong app (Stage 4, Task 6).
//
// KHÔNG push notification. Chỉ hiện khi app đang mở.
// File thuần, không React → test được bằng `node --test`.
// ============================================================

import { actualHours, logicalDate, logicalWeekday } from '@/lib/balance';
import { pickBalance } from '@/lib/banner';
import { dayWindow } from '@/lib/timeline';
import type { Activity, Category } from '@/types/logi';

export type ReminderType = 'morning' | 'evening' | 'weekly';

export interface Reminder {
  type: ReminderType;
  /** Khoá dismiss. Gắn với ngày logic nên tự hết hạn lúc 04:00 hôm sau. */
  key: string;
  text: string;
  /** `null` = chỉ để đọc, không có nút. */
  action: 'start-learn' | null;
}

/** Giờ trong ngày logic → mốc epoch. Ngày logic bắt đầu 04:00. */
function markAt(date: string, hour: number, minute = 0): number {
  return dayWindow(date).start + (hour - 4) * 3_600_000 + minute * 60_000;
}

const h1 = (n: number) => `${Math.round(n * 10) / 10}h`;

export interface ReminderInput {
  now: number;
  /** Record của ngày logic hôm nay. */
  day: Activity[];
  /** Record của cả tuần logic. */
  week: Activity[];
  weekly: Record<Category, number> | null;
  isDismissed: (key: string) => boolean;
}

/**
 * Tối đa MỘT nhắc. Xét theo thứ tự giờ mốc giảm dần - nhắc mới nhất thắng.
 * Nhiều dòng cùng lúc thì người dùng học cách bỏ qua tất cả.
 */
export function pickReminder(input: ReminderInput): Reminder | null {
  const { now, day, week, weekly, isDismissed } = input;
  const today = logicalDate(now);

  const learned = (from: number) =>
    day.some(
      (a) =>
        a.category === 'learn' && a.status !== 'scheduled' && (a.endAt ?? now) > from
    );

  const make = (type: ReminderType, text: string, action: Reminder['action']): Reminder | null => {
    const key = `reminder:${type}:${today}`;
    return isDismissed(key) ? null : { type, key, text, action };
  };

  // 20:45 - chưa học buổi tối.
  if (now >= markAt(today, 20, 45) && !learned(markAt(today, 19))) {
    const done = actualHours(week, now).learn;
    const tail = weekly ? ` Learn: ${h1(done)} / ${h1(weekly.learn)} this week.` : '';
    const r = make('evening', `Evening study not logged yet.${tail}`, 'start-learn');
    if (r) return r;
  }

  // Chủ nhật 19:00 - tổng kết tuần. Luôn hiện.
  if (logicalWeekday(now) === 0 && now >= markAt(today, 19)) {
    const tracked = Object.values(actualHours(week, now)).reduce((a, b) => a + b, 0);
    const worst = pickBalance(week, weekly, now);
    const tail = worst ? ` ${worst.text}` : ' Every category on target.';
    const r = make('weekly', `Week wrap-up: ${h1(tracked)} tracked.${tail}`, null);
    if (r) return r;
  }

  // 06:15 - chưa học buổi sáng.
  if (now >= markAt(today, 6, 15) && !learned(dayWindow(today).start)) {
    const r = make('morning', 'Morning study not logged yet.', 'start-learn');
    if (r) return r;
  }

  return null;
}
