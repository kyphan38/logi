// ---------------------------------------------------------------------------
// logi - Target & giờ thực tế cho MỘT KHOẢNG bất kỳ (Stage 5 Task 2)
//
// Đây là phần dễ sai nhất của Stage 5. Ba cái bẫy:
//
//  1. `weekly × số ngày / 7` là SAI. Target không phân bố đều - thứ Ba Work là
//     9.5h còn Chủ nhật là 0h. Thứ Hai→thứ Sáu preset Normal cho Work 43h,
//     chia đều cho ra 30.7h. Lệch 12h, đủ để mọi kết luận thành rác.
//  2. Mỗi tuần có target riêng. Tuần trước có thể là Crunch, tuần này Normal.
//     Khoảng vắt hai tuần phải đọc target của TỪNG tuần.
//  3. Chỉ ngày hôm nay mới bị pro-rate, và chỉ khi `isPartial`. Ngày quá khứ
//     luôn tính target đầy đủ.
//
// Chất lượng log của một khoảng nằm ở `@/lib/log-quality`, không ở đây.
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import {
  DEV_ABS_THRESHOLD,
  DEV_PCT_THRESHOLD,
  dayProgress,
  logicalDate,
  PRESETS,
} from '@/lib/balance';
import { dailyTargetFor } from '@/lib/day-target';
import { daysOf, weekOf, weekdayOf, type Range } from '@/lib/range';
import { dayWindow } from '@/lib/timeline';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

const H_MS = 3_600_000;

function zero(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
}

/**
 * Target kỳ vọng của cả khoảng, cộng dồn THEO LỊCH.
 *
 * @param weekTargets key = logicalWeek ("2026-W35"). Tuần không có trong map
 *   thì rơi về `PRESETS.normal` - chưa đặt target không có nghĩa là target = 0.
 */
export function expectedForRange(
  range: Range,
  weekTargets: Map<string, Record<Category, number>>,
  now: number = Date.now()
): Record<Category, number> {
  const out = zero();
  const today = logicalDate(now);
  const frac = dayProgress(now);

  // Nhiều ngày dùng chung một tuần → nhớ lại target đã dựng, khỏi tra map 92 lần.
  const cache = new Map<string, Record<Category, number>>();

  for (const d of daysOf(range)) {
    const w = weekOf(d);
    let weekly = cache.get(w);
    if (!weekly) {
      weekly = weekTargets.get(w) ?? PRESETS.normal.weekly;
      cache.set(w, weekly);
    }

    const daily = dailyTargetFor(weekdayOf(d), weekly);
    // Ngày quá khứ: luôn đủ. Hôm nay: chỉ cắt khi khoảng đang dở dang.
    const scale = range.isPartial && d === today ? frac : 1;

    for (const c of CATEGORIES) out[c] += daily[c] * scale;
  }

  return out;
}

/**
 * Hợp (union) các khoảng đã log, cắt gọn trong cửa sổ khoảng.
 * Dùng union thay vì "tổng trừ overlap" để giờ chồng nhau chỉ đếm một lần,
 * kể cả khi ba session chồng lên nhau cùng lúc.
 */
function loggedHours(activities: Activity[], range: Range, now: number): number {
  const winStart = dayWindow(range.from).start;
  const winEnd = Math.min(dayWindow(range.to).end, now);
  if (winEnd <= winStart) return 0;

  const iv: [number, number][] = [];
  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const s = Math.max(a.startAt, winStart);
    const e = Math.min(a.endAt ?? now, winEnd);
    if (e > s) iv.push([s, e]);
  }
  iv.sort((x, y) => x[0] - y[0]);

  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of iv) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;

  return total / H_MS;
}

/**
 * Số giờ đã log theo từng category, gán TRỌN session cho `logicalDate` của
 * `startAt` (AMENDMENT-remove-sleep mục 7).
 *
 * Bản cũ cắt session ở hai đầu khoảng. Với cột một ngày của By day, session
 * 22:00 → 01:00 bị chia đôi cho hai cột: tổng tuần đúng nhưng từng ngày sai, và
 * không cột nào khớp với Balance. Nay không cắt nữa, nên trục Y có thể vượt 24h
 * ở ngày có session vắt qua nửa đêm - đúng như chú thích đầu `StackedDays`.
 *
 * Chỉ heatmap mới dùng giờ đồng hồ thật.
 *
 * Trong một category, giờ chồng nhau VẪN cộng hai lần - đó là chuyện của
 * `overlapForRange`, không phải của thanh này.
 */
export function actualForRange(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): Record<Category, number> {
  const out = zero();

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const d = logicalDate(a.startAt);
    if (d < range.from || d > range.to) continue;
    const e = a.endAt ?? now;
    if (e > a.startAt) out[a.category] += (e - a.startAt) / H_MS;
  }

  return out;
}

/**
 * Giống `Deviation` của balance.ts nhưng bỏ `weeklyTarget` - một khoảng có thể
 * vắt qua nhiều tuần với target khác nhau, nên "target tuần" không có nghĩa.
 */
export interface RangeDeviation {
  category: Category;
  actual: number;
  expected: number;
  deltaHours: number;
  deltaPct: number;
  flag: 'over' | 'under' | 'ok';
}

/**
 * So actual với expected, dùng ĐÚNG deadband kép của balance.ts:
 * chỉ gắn cờ khi lệch > 25% VÀ >= 2h.
 *
 * Không gọi lại `deviations()` được vì hàm đó tự tính expected cho tuần hiện
 * tại; ở đây expected đến từ `expectedForRange`.
 */
export function deviationsForRange(
  actual: Record<Category, number>,
  expected: Record<Category, number>
): RangeDeviation[] {
  return CATEGORIES.map((c) => {
    const deltaHours = actual[c] - expected[c];
    const deltaPct = expected[c] > 0 ? deltaHours / expected[c] : 0;
    const trips =
      Math.abs(deltaPct) > DEV_PCT_THRESHOLD && Math.abs(deltaHours) >= DEV_ABS_THRESHOLD;
    return {
      category: c,
      actual: actual[c],
      expected: expected[c],
      deltaHours,
      deltaPct,
      flag: !trips ? 'ok' : deltaHours > 0 ? 'over' : 'under',
    };
  });
}

/**
 * Giờ bị đếm hai lần trong khoảng (VD vừa Work vừa Learn).
 * Cũng cắt theo cửa sổ khoảng, để khớp với `loggedHours`.
 */
export function overlapForRange(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): number {
  const winStart = dayWindow(range.from).start;
  const winEnd = Math.min(dayWindow(range.to).end, now);

  let sum = 0;
  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const s = Math.max(a.startAt, winStart);
    const e = Math.min(a.endAt ?? now, winEnd);
    if (e > s) sum += e - s;
  }

  return Math.max(0, sum / H_MS - loggedHours(activities, range, now));
}
