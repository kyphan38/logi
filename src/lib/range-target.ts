// ---------------------------------------------------------------------------
// logi — Target & coverage cho MỘT KHOẢNG bất kỳ (Stage 5 Task 2)
//
// Đây là phần dễ sai nhất của Stage 5. Ba cái bẫy:
//
//  1. `weekly × số ngày / 7` là SAI. Target không phân bố đều — thứ Ba Work là
//     9.5h còn Chủ nhật là 0h. Thứ Hai→thứ Sáu preset Normal cho Work 43h,
//     chia đều cho ra 30.7h. Lệch 12h, đủ để mọi kết luận thành rác.
//  2. Mỗi tuần có target riêng. Tuần trước có thể là Crunch, tuần này Normal.
//     Khoảng vắt hai tuần phải đọc target của TỪNG tuần.
//  3. Chỉ ngày hôm nay mới bị pro-rate, và chỉ khi `isPartial`. Ngày quá khứ
//     luôn tính target đầy đủ.
//
// `coverage()` của balance.ts chia cứng cho 168h nên không dùng lại được ở đây.
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
 *   thì rơi về `PRESETS.normal` — chưa đặt target không có nghĩa là target = 0.
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
 * Tổng số giờ THỰC của khoảng, tính theo ngày logic.
 * Ngày hôm nay chỉ tính tới `now` — phần chưa sống thì không thể log được.
 */
export function realHoursOfRange(range: Range, now: number = Date.now()): number {
  const today = logicalDate(now);
  let h = 0;
  for (const d of daysOf(range)) {
    if (d === today) h += 24 * dayProgress(now);
    else if (d < today) h += 24;
    // Ngày tương lai (chỉ xảy ra nếu ai đó dựng range tay) không cộng gì.
  }
  return h;
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
 * Phần của khoảng thực sự được log, 0..1.
 *
 * Coverage mục tiêu ~70% (kế hoạch 129.5h/168h; phần còn lại là ăn uống, đi
 * lại — không log). Dưới 55% thì mọi kết luận khác đều không đáng tin, nên
 * chỉ số này phải hiện TRƯỚC các chart.
 */
export function coverageForRange(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): number {
  const real = realHoursOfRange(range, now);
  if (real <= 0) return 0;
  return loggedHours(activities, range, now) / real;
}

/**
 * Số giờ đã log theo từng category, cắt gọn trong cửa sổ khoảng.
 *
 * `actualHours()` của balance.ts cộng trọn cả session; ở đây phần tràn ra ngoài
 * hai đầu khoảng phải bị cắt, nếu không thanh Sleep của khoảng một ngày sẽ dài
 * hơn 24h. Trong một category, giờ chồng nhau VẪN cộng hai lần — đó là chuyện
 * của `overlapForRange`, không phải của thanh này.
 */
export function actualForRange(
  activities: Activity[],
  range: Range,
  now: number = Date.now()
): Record<Category, number> {
  const out = zero();
  const winStart = dayWindow(range.from).start;
  const winEnd = Math.min(dayWindow(range.to).end, now);

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const s = Math.max(a.startAt, winStart);
    const e = Math.min(a.endAt ?? now, winEnd);
    if (e > s) out[a.category] += (e - s) / H_MS;
  }

  return out;
}

/**
 * Giống `Deviation` của balance.ts nhưng bỏ `weeklyTarget` — một khoảng có thể
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
 * Cũng cắt theo cửa sổ khoảng, để khớp với `coverageForRange`.
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
