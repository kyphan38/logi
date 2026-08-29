// ============================================================
// logi - Chất lượng log (AMENDMENT-remove-sleep mục 3.2)
//
// Thay cho coverage(). Không có mẫu số 24h, không giả định gì về giấc ngủ.
// Chỉ đo khoảng trống GIỮA các hoạt động đã log.
//
// File thuần: không React, không Firestore, không DOM.
// ============================================================

import { logicalDate } from '@/lib/balance';
import { daysOf } from '@/lib/range';
import type { Activity } from '@/types/logi';

export interface LogQuality {
  /** Giờ đã log, đã trừ overlap. */
  trackedHours: number;
  /** Khoảng trống GIỮA activity đầu và cuối của mỗi ngày. */
  gapHours: number;
  /** Tổng (cuối − đầu) của các ngày có log. */
  activeSpanHours: number;
  /** Số ngày có ít nhất 1 activity. */
  loggedDays: number;
  totalDays: number;
  /** gapHours / activeSpanHours. 0 khi chưa có ngày nào có log. */
  gapRatio: number;
}

/** Chỉ những gì thật sự đã xảy ra. Lịch hẹn và session bỏ dở không tính. */
function counted(activities: Activity[]): Activity[] {
  return activities.filter((a) => a.status === 'active' || a.status === 'done');
}

/**
 * Gộp các khoảng chồng nhau lại. Trả về giờ đã log và span đầu→cuối.
 * `end` là mốc kết thúc của ngày: hôm nay thì kéo tới `now`.
 */
function spanOf(
  acts: Activity[],
  now: number,
  isToday: boolean
): { tracked: number; span: number } {
  const iv = acts
    .map((a) => [a.startAt, a.endAt ?? now] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);

  if (iv.length === 0) return { tracked: 0, span: 0 };

  let tracked = 0;
  let maxEnd = -Infinity;
  for (const [s, e] of iv) {
    tracked += e - Math.max(s, Math.min(e, maxEnd));
    maxEnd = Math.max(maxEnd, e);
  }

  const first = iv[0][0];
  // Hôm nay chưa xong: khoảng từ activity cuối tới bây giờ vẫn là khoảng trống.
  const last = isToday ? Math.max(maxEnd, now) : maxEnd;
  return { tracked, span: Math.max(0, last - first) };
}

const H = 3_600_000;

/**
 * Ba con số thô cho một khoảng ngày: "62h logged · 9h gaps · 5 of 7 days".
 *
 * Thời gian TRƯỚC activity đầu tiên và SAU activity cuối cùng của mỗi ngày
 * không tính vào đâu cả - đó không phải giờ quên log, chỉ là không có gì để log.
 */
export function logQuality(
  activities: Activity[],
  range: { from: string; to: string },
  now: number = Date.now()
): LogQuality {
  const today = logicalDate(now);
  const days = daysOf(range);

  const byDate = new Map<string, Activity[]>();
  for (const a of counted(activities)) {
    const d = a.logicalDate || logicalDate(a.startAt);
    const list = byDate.get(d);
    if (list) list.push(a);
    else byDate.set(d, [a]);
  }

  let trackedMs = 0;
  let spanMs = 0;
  let loggedDays = 0;

  for (const day of days) {
    const acts = byDate.get(day);
    if (!acts || acts.length === 0) continue; // không log → không đóng góp span
    const { tracked, span } = spanOf(acts, now, day === today);
    if (tracked <= 0 && span <= 0) continue;
    trackedMs += tracked;
    spanMs += span;
    loggedDays += 1;
  }

  const gapMs = Math.max(0, spanMs - trackedMs);

  return {
    trackedHours: trackedMs / H,
    gapHours: gapMs / H,
    activeSpanHours: spanMs / H,
    loggedDays,
    totalDays: days.length,
    gapRatio: spanMs > 0 ? gapMs / spanMs : 0,
  };
}

/** Cùng định nghĩa, phạm vi một ngày logic. Thay cho coverageOfDay(). */
export function dayLogQuality(
  activities: Activity[],
  date: string,
  now: number = Date.now()
): LogQuality {
  return logQuality(activities, { from: date, to: date }, now);
}

// ------------------------------------------------------------
// Cảnh báo - cần CẢ HAI điều kiện mới đủ bịt lỗ hổng
// ------------------------------------------------------------

/** Nhiều khoảng trống giữa các hoạt động. */
export const GAP_RATIO_LIMIT = 0.25;
/** Nhiều ngày không log gì. */
export const LOGGED_DAYS_LIMIT = 0.6;

/**
 * `gapRatio` một mình có lỗ hổng: ngày chỉ log đúng một session 30 phút thì
 * span = 30 phút, gap = 0, trông hoàn hảo trong khi gần như không log gì.
 * `loggedDays` bịt lỗ đó.
 */
export function isThin(q: LogQuality): boolean {
  return (
    q.gapRatio > GAP_RATIO_LIMIT ||
    (q.totalDays > 0 && q.loggedDays / q.totalDays < LOGGED_DAYS_LIMIT)
  );
}

function hours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

/** "62h logged · 9h gaps · 5 of 7 days" */
export function logQualityLine(q: LogQuality): string {
  return `${hours(q.trackedHours)} logged · ${hours(q.gapHours)} gaps · ${q.loggedDays} of ${q.totalDays} days`;
}

/** "9h of gaps across 5 logged days." */
export function thinWarning(q: LogQuality): string {
  return `${hours(q.gapHours)} of gaps across ${q.loggedDays} logged ${q.loggedDays === 1 ? 'day' : 'days'}.\nThe numbers below may not reflect reality.`;
}
