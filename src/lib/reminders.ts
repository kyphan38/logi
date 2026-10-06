// ============================================================
// logi - In-app reminders (Stage 4, Task 6).
//
// NO push notification. Only shown while the app is open.
// Pure file, no React → testable with `node --test`.
// ============================================================

import { actualHours, logicalDate, logicalWeekday } from '@/lib/balance';
import { pickBalance } from '@/lib/banner';
import { dayWindow } from '@/lib/timeline';
import type { Activity, Category } from '@/types/logi';

export type ReminderType = 'morning' | 'evening' | 'weekly';

export interface Reminder {
  type: ReminderType;
  /** Dismiss key. Tied to the logical day, so it expires at 04:00 the next day. */
  key: string;
  text: string;
  /** `null` = read-only, no button. */
  action: 'start-learn' | null;
}

/** Time within the logical day → epoch. The logical day starts at 04:00. */
function markAt(date: string, hour: number, minute = 0): number {
  return dayWindow(date).start + (hour - 4) * 3_600_000 + minute * 60_000;
}

const h1 = (n: number) => `${Math.round(n * 10) / 10}h`;

export interface ReminderInput {
  now: number;
  /** Records of today's logical day. */
  day: Activity[];
  /** Records of the whole logical week. */
  week: Activity[];
  weekly: Record<Category, number> | null;
  isDismissed: (key: string) => boolean;
}

/**
 * At most ONE reminder. Checked by mark time, latest first - the newest wins.
 * Several lines at once teach the user to ignore them all.
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

  // 20:45 - no evening study yet.
  if (now >= markAt(today, 20, 45) && !learned(markAt(today, 19))) {
    const done = actualHours(week, now).learn;
    const tail = weekly ? ` Learn: ${h1(done)} / ${h1(weekly.learn)} this week.` : '';
    const r = make('evening', `Evening study not logged yet.${tail}`, 'start-learn');
    if (r) return r;
  }

  // Sunday 19:00 - weekly wrap-up. Always shown.
  if (logicalWeekday(now) === 0 && now >= markAt(today, 19)) {
    const tracked = Object.values(actualHours(week, now)).reduce((a, b) => a + b, 0);
    const worst = pickBalance(week, weekly, now);
    const tail = worst ? ` ${worst.text}` : ' Every category on target.';
    const r = make('weekly', `Week wrap-up: ${h1(tracked)} tracked.${tail}`, null);
    if (r) return r;
  }

  // 06:15 - no morning study yet.
  if (now >= markAt(today, 6, 15) && !learned(dayWindow(today).start)) {
    const r = make('morning', 'Morning study not logged yet.', 'start-learn');
    if (r) return r;
  }

  return null;
}
