// ============================================================
// logi — Weekly Review (Stage 6 Task 1)
//
// Đóng vòng lặp: nhìn lại tuần vừa rồi → chọn preset tuần tới.
//
// File thuần: không React, không Firestore. Test bằng `node --test`.
// Toàn bộ số liệu đi qua range-target.ts của Stage 5 — KHÔNG tự tính lại,
// vì `expectedHours()` pro-rate theo tuần đang chạy, dùng cho tuần đã xong
// sẽ ra sai (nó lấy weekday của tuần MỚI).
// ============================================================

import {
  crunchStreak,
  dayProgress,
  logicalDate,
  logicalWeek,
  logicalWeekday,
  weekendConflict,
} from '@/lib/balance';
import type { Range } from '@/lib/range';
import { rangeLabel } from '@/lib/range';
import {
  actualForRange,
  coverageForRange,
  deviationsForRange,
  expectedForRange,
  type RangeDeviation,
} from '@/lib/range-target';
import { buildWeekly, type DebtBalance, type Weekly } from '@/lib/rollover';
import { addDays, dayWindow } from '@/lib/timeline';
import { addWeeks, weekStart } from '@/lib/week';
import {
  CATEGORY_LABEL,
  PRESETS,
  type Activity,
  type Category,
  type PresetId,
} from '@/types/logi';

// ------------------------------------------------------------
// Kích hoạt
// ------------------------------------------------------------

/** Chủ nhật 19:00 giờ logic. */
export const REVIEW_HOUR = 19;

/**
 * Lỡ tối Chủ nhật thì thứ Hai và thứ Ba vẫn còn mở.
 * Không có cửa sổ này thì bỏ một tuần là mất luôn tuần đó — mà tuần bận
 * (đúng tuần đáng review nhất) lại chính là tuần dễ quên nhất.
 */
export const GRACE_WEEKDAY_MAX = 2; // 1 = T2, 2 = T3

function markAt(date: string, hour: number): number {
  return dayWindow(date).start + (hour - 4) * 3_600_000;
}

/**
 * Tuần đang cần review, hoặc null.
 * `isReviewed` tra cờ trong `meta/reviews` — đã review rồi thì không hiện lại.
 */
export function reviewDueWeek(
  now: number,
  isReviewed: (week: string) => boolean
): string | null {
  const current = logicalWeek(now);
  const dow = logicalWeekday(now); // 0 = CN

  if (dow === 0 && now >= markAt(logicalDate(now), REVIEW_HOUR)) {
    return isReviewed(current) ? null : current;
  }
  if (dow >= 1 && dow <= GRACE_WEEKDAY_MAX) {
    const prev = addWeeks(current, -1);
    return isReviewed(prev) ? null : prev;
  }
  return null;
}

// ------------------------------------------------------------
// Màn 1 — số liệu tuần
// ------------------------------------------------------------

/**
 * Khoảng ngày logic của một tuần ISO.
 * `isPartial` chỉ bật khi hôm nay đúng là Chủ nhật của tuần đó và ngày chưa hết —
 * đúng lúc banner 19:00 kích hoạt. Nhờ vậy target Chủ nhật được pro-rate,
 * không báo thiếu 8h chỉ vì còn 5 tiếng nữa mới hết ngày.
 */
export function weekRange(week: string, now: number = Date.now()): Range {
  const from = logicalDate(weekStart(week));
  const to = addDays(from, 6);
  return {
    from,
    to,
    kind: 'custom',
    isPartial: to === logicalDate(now) && dayProgress(now) < 1,
  };
}

export interface ReviewInput {
  week: string;
  /** Record của tuần đó (đã lọc sẵn theo logicalWeek). */
  activities: Activity[];
  /** key = logicalWeek. Thiếu tuần nào thì range-target lùi về PRESETS.normal. */
  weekTargets: Map<string, Weekly>;
  /** Lịch sử preset để tính streak — tăng dần theo tuần. */
  history: { preset: PresetId }[];
  now: number;
}

export interface ReviewSummary {
  week: string;
  /** "Week 35 · Aug 24 – Aug 30" */
  title: string;
  range: Range;
  rows: RangeDeviation[];
  coverage: number;
  /** Tối đa hai dòng. */
  notes: string[];
}

const h1 = (n: number) => `${Math.round(n * 10) / 10}h`;

export function reviewTitle(week: string, range: Range): string {
  const n = Number(week.slice(-2));
  return `Week ${n} · ${rangeLabel(range)}`;
}

export function buildReview(input: ReviewInput): ReviewSummary {
  const { week, activities, weekTargets, history, now } = input;
  const range = weekRange(week, now);

  const actual = actualForRange(activities, range, now);
  const expected = expectedForRange(range, weekTargets, now);
  const rows = deviationsForRange(actual, expected);
  const cov = coverageForRange(activities, range, now);

  return {
    week,
    title: reviewTitle(week, range),
    range,
    rows,
    coverage: cov,
    notes: pickNotes({ activities, rows, coverage: cov, weekTargets, week, history, now }),
  };
}

// ------------------------------------------------------------
// Màn 2 — điều đáng chú ý
// ------------------------------------------------------------

export interface NoteInput {
  activities: Activity[];
  rows: RangeDeviation[];
  coverage: number;
  weekTargets: Map<string, Weekly>;
  week: string;
  history: { preset: PresetId }[];
  now: number;
}

/** Không có gì đáng nói cũng là một kết quả — đừng bịa ra chuyện để nói. */
export const BALANCED = 'A balanced week.';

/**
 * Tối đa hai dòng, theo đúng thứ tự ưu tiên của plan.
 * Nêu số, không khuyên bảo.
 */
export function pickNotes(input: NoteInput): string[] {
  const { activities, rows, coverage, weekTargets, week, history } = input;
  const out: string[] = [];

  // 1. OT cuối tuần ăn vào giờ học — thứ đáng nói nhất.
  const target = weekTargets.get(week) ?? PRESETS.normal.weekly;
  const conflict = weekendConflict(activities, target, input.now);
  if (conflict) out.push(conflict);

  // 2. Lệch lớn nhất theo giờ tuyệt đối. Chỉ lấy cái đã qua deadband kép.
  const worst = rows
    .filter((r) => r.flag !== 'ok')
    .sort((a, b) => Math.abs(b.deltaHours) - Math.abs(a.deltaHours))[0];
  if (worst && out.length < 2) {
    const sign = worst.deltaHours > 0 ? '+' : '−';
    out.push(
      `${CATEGORY_LABEL[worst.category]} ${h1(worst.actual)} / ${h1(worst.expected)} · ` +
        `${sign}${Math.abs(Math.round(worst.deltaPct * 100))}%`
    );
  }

  // 3. Log quá ít thì mấy con số trên không đáng tin — phải nói ra.
  if (coverage < 0.55 && out.length < 2) {
    out.push(`Only ${Math.round(coverage * 100)}% of the week is logged.`);
  }

  // 4. Crunch liên tục là dấu hiệu baseline sai, không phải tuần bận.
  const streak = crunchStreak(history);
  if (streak.count >= 4 && out.length < 2) {
    out.push(`Crunch: ${streak.count} of the last ${streak.of} weeks.`);
  }

  return out.length > 0 ? out.slice(0, 2) : [BALANCED];
}

// ------------------------------------------------------------
// Màn 3 — tuần tới
// ------------------------------------------------------------

export interface NextWeekPlan {
  week: string;
  preset: PresetId;
  weekly: Weekly;
  /** Nợ sẽ cộng vào target tuần sau. */
  applied: DebtBalance;
  remaining: DebtBalance;
  /** "Carrying over: Learn +6.0h debt" — rỗng nếu không nợ gì. */
  debtNote: string;
}

/**
 * Xem trước tuần kế tiếp. Thuần — chưa ghi gì cả.
 * Dùng `buildWeekly()` của rollover.ts để con số y hệt cái rollover sẽ tạo,
 * không phải một phép tính thứ hai chạy song song.
 */
export function planNextWeek(
  week: string,
  presetId: PresetId,
  debt: DebtBalance
): NextWeekPlan {
  const next = addWeeks(week, 1);
  const { weekly, applied, remaining } = buildWeekly(PRESETS[presetId].weekly, debt);

  const parts = (Object.entries(applied) as [Category, number][])
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${CATEGORY_LABEL[c]} +${h1(v)}`);

  return {
    week: next,
    preset: presetId,
    weekly,
    applied,
    remaining,
    debtNote: parts.length > 0 ? `Carrying over: ${parts.join(', ')} debt` : '',
  };
}

/** Tuần đã qua thì chỉ xem. Không cho đổi preset của quá khứ. */
export function canSetNextWeek(week: string, now: number = Date.now()): boolean {
  return addWeeks(week, 1) >= logicalWeek(now);
}
