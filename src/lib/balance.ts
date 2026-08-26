// ============================================================
// logi — Logical time, pro-rated targets, deviation, debt
// ============================================================

import {
  Activity, Category, CATEGORIES, DailyTargets, BASELINE_DAILY, BASELINE_WEEKLY,
  DAY_CUTOFF_HOUR, HARD_FLOOR, TOTAL_BUDGET, PRESETS, PresetId,
  DEBT_CARRYOVER_RATE, DEBT_CARRYOVER_CAP,
} from '@/types/logi';

// ------------------------------------------------------------
// 1. Logical day / week
// ------------------------------------------------------------

/**
 * Ngày logic: mốc cắt 04:00 thay vì nửa đêm.
 * Ngủ 22:00 T2 → "T2". Nap 02:00 T3 → cũng "T2".
 * Toàn bộ analytics phải đi qua hàm này, không bao giờ dùng ngày lịch thô.
 */
export function logicalDate(ts: number): string {
  const d = new Date(ts);
  if (d.getHours() < DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Thứ trong tuần của ngày logic. 0 = CN ... 6 = T7 */
export function logicalWeekday(ts: number): number {
  const [y, m, d] = logicalDate(ts).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Tuần ISO, VD "2026-W35". Tuần bắt đầu thứ Hai. */
export function logicalWeek(ts: number): string {
  const [y, m, d] = logicalDate(ts).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7;          // CN = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); // dời tới thứ Năm
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Phần của ngày logic đã trôi qua, 0..1. Dùng để pro-rate target hôm nay. */
export function dayProgress(now: number = Date.now()): number {
  const d = new Date(now);
  let h = d.getHours() - DAY_CUTOFF_HOUR;
  if (h < 0) h += 24;
  return Math.min(1, (h + d.getMinutes() / 60) / 24);
}

// ------------------------------------------------------------
// 2. Cộng dồn thời lượng thực tế
// ------------------------------------------------------------

/**
 * Session đang chạy được tính tới thời điểm now — timer là derived state,
 * không bao giờ là counter cộng dồn.
 */
export function actualHours(
  activities: Activity[],
  now: number = Date.now()
): Record<Category, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const end = a.endAt ?? now;
    if (end <= a.startAt) continue;
    out[a.category] += (end - a.startAt) / 3_600_000;
  }
  return out;
}

/**
 * Tổng thời gian bị double-count do log song song (VD vừa Work vừa Learn).
 * Phải hiển thị chỉ số này — nếu không, tổng giờ/ngày vượt 24h mà không ai biết.
 * Vì lý do đó mọi chart dùng GIỜ TUYỆT ĐỐI, không dùng % của 24h.
 */
export function overlapHours(activities: Activity[], now: number = Date.now()): number {
  const iv = activities
    .filter((a) => a.status === 'active' || a.status === 'done')
    .map((a) => [a.startAt, a.endAt ?? now] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);

  let overlap = 0;
  let maxEnd = -Infinity;
  for (const [s, e] of iv) {
    if (s < maxEnd) overlap += (Math.min(e, maxEnd) - s);
    maxEnd = Math.max(maxEnd, e);
  }
  return overlap / 3_600_000;
}

/** % của 168h thực sự được log. < 55% → mọi kết luận khác không đáng tin. */
export function coverage(activities: Activity[], now?: number): number {
  const total = Object.values(actualHours(activities, now)).reduce((a, b) => a + b, 0);
  return (total - overlapHours(activities, now)) / 168;
}

// ------------------------------------------------------------
// 3. Expected — pro-rate theo LỊCH, không chia đều
// ------------------------------------------------------------

/**
 * Giữa tuần, expected của Work KHÔNG phải 43 × 3/7.
 * Phải cộng dồn target của từng ngày đã trôi qua, cộng phần lẻ hôm nay.
 * Không có bước này thì thứ Ba nào app cũng báo bạn "thiếu Work".
 */
export function expectedHours(
  weeklyTarget: Record<Category, number>,
  now: number = Date.now()
): Record<Category, number> {
  const todayDow = logicalWeekday(now);
  const elapsedDows: number[] = [];
  for (let i = 1; i < 8; i++) {         // tuần bắt đầu thứ Hai
    const dow = i % 7;
    if (dow === todayDow) break;
    elapsedDows.push(dow);
  }
  const frac = dayProgress(now);

  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    const shape = BASELINE_DAILY[c];
    const scale = weeklyTarget[c] / BASELINE_WEEKLY[c]; // giữ nguyên hình dạng tuần
    let h = 0;
    for (const dow of elapsedDows) h += shape[dow] * scale;
    h += shape[todayDow] * scale * frac;
    out[c] = h;
  }
  return out;
}

// ------------------------------------------------------------
// 4. Deviation — deadband kép
// ------------------------------------------------------------

export const DEV_PCT_THRESHOLD = 0.25; // 25%
export const DEV_ABS_THRESHOLD = 2;    // 2 giờ

export interface Deviation {
  category: Category;
  actual: number;
  expected: number;
  weeklyTarget: number;
  deltaHours: number;
  deltaPct: number;
  flag: 'over' | 'under' | 'ok';
}

/**
 * Chỉ báo động khi lệch >25% VÀ >=2h.
 * Điều kiện thứ hai then chốt: thiếu nó, Leisure lệch 40 phút đã bắn cảnh báo
 * và bạn sẽ tắt app sau 3 ngày.
 */
export function deviations(
  activities: Activity[],
  weeklyTarget: Record<Category, number>,
  now: number = Date.now()
): Deviation[] {
  const act = actualHours(activities, now);
  const exp = expectedHours(weeklyTarget, now);

  return CATEGORIES.map((c) => {
    const deltaHours = act[c] - exp[c];
    const deltaPct = exp[c] > 0 ? deltaHours / exp[c] : 0;
    const trips = Math.abs(deltaPct) > DEV_PCT_THRESHOLD && Math.abs(deltaHours) >= DEV_ABS_THRESHOLD;
    return {
      category: c,
      actual: act[c],
      expected: exp[c],
      weeklyTarget: weeklyTarget[c],
      deltaHours,
      deltaPct,
      flag: !trips ? 'ok' : deltaHours > 0 ? 'over' : 'under',
    };
  });
}

/**
 * Câu chữ: NÊU SỐ, KHÔNG DẠY ĐỜI.
 * "Bạn dành cho X nhiều hơn mức cân bằng rồi" nghe khó chịu sau vài lần.
 */
export function formatDeviation(d: Deviation): string {
  const sign = d.deltaHours > 0 ? '+' : '';
  return `${d.category}: ${d.actual.toFixed(1)}h / ${d.expected.toFixed(1)}h (${sign}${Math.round(d.deltaPct * 100)}%)`;
}

/**
 * Rule riêng cho pain point: OT cuối tuần nuốt mất Learn.
 * Giá trị hơn mọi deviation chung vì nó nối hai category lại với nhau.
 */
export function weekendConflict(
  activities: Activity[],
  weeklyTarget: Record<Category, number>,
  now: number = Date.now()
): string | null {
  const weekend = activities.filter((a) => [0, 6].includes(logicalWeekday(a.startAt)));
  const w = actualHours(weekend, now);
  if (w.work <= 0) return null;

  const learnTarget = weeklyTarget.learn;
  const learnActual = actualHours(activities, now).learn;
  const gap = learnTarget - learnActual;
  if (gap < DEV_ABS_THRESHOLD) return null;

  return `OT cuối tuần: ${w.work.toFixed(1)}h. Learn còn thiếu ${gap.toFixed(1)}h so với mục tiêu ${learnTarget}h.`;
}

// ------------------------------------------------------------
// 5. Zero-sum budget — chống overset
// ------------------------------------------------------------

export interface BudgetCheck {
  ok: boolean;
  total: number;
  budget: number;
  errors: string[];
}

/**
 * Không thêm được thời gian vào một tuần — chỉ đổi chỗ nó.
 * Kéo Work lên +8h thì UI BẮT BUỘC lấy 8h đó từ category khác.
 */
export function validateTargets(weekly: Record<Category, number>): BudgetCheck {
  const errors: string[] = [];
  const total = Object.values(weekly).reduce((a, b) => a + b, 0);

  if (Math.abs(total - TOTAL_BUDGET) > 0.1) {
    const diff = total - TOTAL_BUDGET;
    errors.push(
      diff > 0
        ? `Vượt ngân sách ${diff.toFixed(1)}h — hãy giảm ở category khác.`
        : `Còn thừa ${(-diff).toFixed(1)}h chưa phân bổ.`
    );
  }
  for (const [c, floor] of Object.entries(HARD_FLOOR)) {
    if (weekly[c as Category] < floor!) {
      errors.push(`${c} không được dưới ${floor}h/tuần.`);
    }
  }
  return { ok: errors.length === 0, total, budget: TOTAL_BUDGET, errors };
}

/** Khi kéo một category, tự trừ/bù đều ở các category còn lại (trừ sleep). */
export function rebalance(
  weekly: Record<Category, number>,
  changed: Category,
  newValue: number
): Record<Category, number> {
  const next = { ...weekly, [changed]: newValue };
  const others = CATEGORIES.filter((c) => c !== changed && c !== 'sleep');
  let delta = Object.values(next).reduce((a, b) => a + b, 0) - TOTAL_BUDGET;

  for (let pass = 0; pass < 5 && Math.abs(delta) > 0.05; pass++) {
    const pool = others.filter((c) => next[c] - (HARD_FLOOR[c] ?? 0) > 0.05 || delta < 0);
    if (!pool.length) break;
    const share = delta / pool.length;
    for (const c of pool) {
      next[c] = Math.max(HARD_FLOOR[c] ?? 0, next[c] - share);
    }
    delta = Object.values(next).reduce((a, b) => a + b, 0) - TOTAL_BUDGET;
  }
  return next;
}

// ------------------------------------------------------------
// 6. Debt — làm cho việc cắt giảm có giá
// ------------------------------------------------------------

/** Cuối tuần: chênh lệch so với baseline được ghi thành nợ. */
export function accrueDebt(
  weekly: Record<Category, number>,
  current: Partial<Record<Category, number>>
): Partial<Record<Category, number>> {
  const next = { ...current };
  for (const c of CATEGORIES) {
    const cut = BASELINE_WEEKLY[c] - weekly[c];
    if (cut > 0) next[c] = (next[c] ?? 0) + cut;
  }
  return next;
}

/** Đầu tuần: cộng 50% nợ vào target, trần 10h. Cắt giảm chỉ là hoãn lại. */
export function applyDebt(
  weekly: Record<Category, number>,
  debt: Partial<Record<Category, number>>
): { weekly: Record<Category, number>; applied: Partial<Record<Category, number>>; remaining: Partial<Record<Category, number>> } {
  const applied: Partial<Record<Category, number>> = {};
  const remaining = { ...debt };
  const next = { ...weekly };

  for (const c of CATEGORIES) {
    const owed = debt[c] ?? 0;
    if (owed <= 0) continue;
    const pay = Math.min(owed * DEBT_CARRYOVER_RATE, DEBT_CARRYOVER_CAP);
    next[c] += pay;
    applied[c] = pay;
    remaining[c] = owed - pay;
  }
  return { weekly: next, applied, remaining };
}

/** 4/6 tuần là Crunch thì đó không còn là crunch — đó là baseline thật. */
export function crunchStreak(history: { preset: PresetId }[]): { count: number; of: number; shouldPrompt: boolean } {
  const recent = history.slice(-6);
  const count = recent.filter((w) => w.preset === 'crunch').length;
  return { count, of: recent.length, shouldPrompt: recent.length >= 6 && count >= 4 };
}

// ------------------------------------------------------------
// 7. Session bỏ quên
// ------------------------------------------------------------

/** Quá 15h → abandoned, KHÔNG xoá. Hỏi lại giờ kết thúc khi mở app. */
export function findStale(activities: Activity[], now: number = Date.now()): Activity[] {
  return activities.filter(
    (a) => a.status === 'active' && now - a.startAt > 15 * 3_600_000
  );
}

export function suggestedEndTimes(a: Activity): { label: string; ts: number }[] {
  const d = new Date(a.startAt);
  const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
  const map: Record<Category, number[]> = {
    work: [17, 22], learn: [6, 22], fitness: [19], sleep: [4, 6], leisure: [22],
  };
  return (map[a.category] ?? [22])
    .map((h) => ({ label: `${String(h).padStart(2, '0')}:00`, ts: at(h) }))
    .filter((x) => x.ts > a.startAt);
}

export { PRESETS };
