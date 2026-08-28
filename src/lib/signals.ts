// ---------------------------------------------------------------------------
// logi - Chỉ số deterministic cho AI Insights (Stage 7 Task 1)
//
// Quy tắc bất biến của Stage 7:
//
//     Code tính toán. AI chỉ diễn giải và chọn cái đáng nói.
//
// File này là phần "code tính toán". Mọi con số mà model được phép viết ra
// đều phải sinh ra ở đây trước. Model không bao giờ nhìn thấy record thô.
//
// Thuần: không React, không Firestore, không Gemini. Test bằng `node --test`.
// Không sửa `logi.ts` / `balance.ts` - chỉ dùng lại.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { dailyTargetFor } from '@/lib/day-target';
import {
  actualForRange,
  coverageForRange,
  overlapForRange,
} from '@/lib/range-target';
import { daysBetween, daysOf, rangeLabel, weekOf, weekdayOf, type Range } from '@/lib/range';
import { addDays, dayWindow } from '@/lib/timeline';
import { CATEGORIES, PRESETS, type Activity, type Category, type PresetId } from '@/types/logi';

const H = 3_600_000;
const MIN = 60_000;

/** Dưới ngần này mẫu thì mọi liên hệ chéo đều là ngẫu nhiên → trả `null`. */
export const MIN_SAMPLE = 3;

/** Đêm ngắn: dưới 6h. */
export const SHORT_NIGHT_H = 6;
/** Ngủ dài hơn mốc này mới tính là "đêm"; ngắn hơn là nap. */
export const NAP_MAX_H = 4;
/** Ngày Work nhiều: trên 9h. Dùng cho nhóm G và `skippedAfterWorkDays`. */
export const HIGH_WORK_H = 9;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

/** Nhóm A - mọi category đo cùng một bộ chỉ số, không ưu ái cái nào. */
export interface CatStat {
  actual: number;
  expected: number;
  /** (actual − expected) / expected. Không có target → null. */
  deviationPct: number | null;
  /** Chênh giờ so với kỳ trước. Không có kỳ trước → null. */
  deltaVsPrevious: number | null;
  sessions: number;
  medianSessionMin: number | null;
  longestBlockMin: number | null;
  zeroDays: number;
}

export interface SleepSignals {
  nights: number;
  /** Phút trên "trục đêm": 22:00 = 1320, 00:30 = 1470. Digest mới đổi ra HH:MM. */
  medianBedtime: number | null;
  /** Phút trong ngày. */
  medianWakeTime: number | null;
  bedtimeSpreadMin: number | null;
  nightsAfter23: number;
  medianSleepDuration: number | null;
  shortNights: number;
  napCount: number;
  napHours: number;
}

export interface WorkSignals {
  otHours: number;
  weekendWorkHours: number;
  lateWorkHours: number;
  longestWorkDay: { date: string; weekday: number; hours: number } | null;
  daysOver10hWork: number;
  officeDaysLogged: number;
  workEndSpreadMin: number | null;
}

export interface LearnSignals {
  morningLearnDays: number;
  morningLearnHours: number;
  eveningLearnDays: number;
  eveningLearnHours: number;
  weekendLearnHours: number;
  weekendLearnTarget: number;
  learnStreak: number;
  longestLearnBlockMin: number | null;
  daysWithZeroLearn: number;
  weekdayWorstForLearn: { weekday: number; hours: number } | null;
}

export interface FitnessSignals {
  sessions: number;
  sessionsPerWeek: number;
  longestGapDays: number | null;
  daysSinceLast: number | null;
  medianSessionMin: number | null;
  /** Index 0 = CN … 6 = T7. */
  weekdayDistribution: number[];
  skippedAfterWorkDays: number;
}

export interface LeisureSignals {
  hours: number;
  lateLeisureHours: number;
  leisureNightsDelayingSleep: number;
  longestBlockMin: number | null;
  weekdayLeisureHours: number;
  weekendLeisureHours: number;
}

/** Mọi chỉ số nhóm G bắt buộc kèm `sampleSize`. */
export interface Link {
  value: number;
  sampleSize: number;
}

export interface LinkSignals {
  learnOnHighWorkDays: Link | null;
  learnOnNormalDays: Link | null;
  fitnessAfterShortNights: Link | null;
  learnAfterShortNights: Link | null;
  sleepAfterLateWork: Link | null;
  weekendLearnVsWeekendWork: { learn: number; work: number; sampleSize: number } | null;
  displacedBy: {
    up: Category;
    upHours: number;
    down: Category;
    downHours: number;
    sampleSize: number;
  } | null;
}

export interface Signals {
  from: string;
  to: string;
  rangeLabel: string;
  dayCount: number;
  /** Số ngày đã thực sự sống trong khoảng - ngày mai không thể có zeroDays. */
  elapsedDays: number;
  preset: PresetId | null;
  coverage: number;
  overlapHours: number;
  recordCount: number;
  hasPrevious: boolean;
  byCategory: Record<Category, CatStat>;
  sleep: SleepSignals;
  work: WorkSignals;
  learn: LearnSignals;
  fitness: FitnessSignals;
  leisure: LeisureSignals;
  links: LinkSignals;
}

export interface PreviousPeriod {
  activities: Activity[];
  expected: Record<Category, number>;
}

/**
 * Khoảng liền trước, cùng độ dài. Dùng cho `deltaVsPrevious` và `displacedBy`.
 * Tách ra để UI query đúng cửa sổ mà `computeSignals` mong đợi.
 */
export function previousRange(range: Range): Range {
  const n = daysBetween(range.from, range.to);
  return {
    from: addDays(range.from, -n),
    to: addDays(range.to, -n),
    kind: 'custom',
    isPartial: false,
  };
}

// ---------------------------------------------------------------------------
// Tiện ích nội bộ
// ---------------------------------------------------------------------------

function zero(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function minutesOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Trục đêm: giờ trước trưa được đẩy sang ngày hôm sau.
 * 22:00 → 1320, 00:30 → 1470. Không có bước này thì trung vị của
 * [23:50, 00:10] ra 12:00 trưa - sai hoàn toàn.
 */
function nightAxis(min: number): number {
  return min < 720 ? min + 1440 : min;
}

/** Một session đã cắt gọn trong cửa sổ khoảng. */
interface Sess {
  category: Category;
  /** Đã cắt. */
  start: number;
  end: number;
  /** Nguyên bản - dùng cho giờ đi ngủ / giờ dậy. */
  rawStart: number;
  rawEnd: number;
  /** Ngày logic của thời điểm bắt đầu. */
  day: string;
  minutes: number;
  fullHours: number;
}

/** Một lát của session nằm gọn trong MỘT ngày lịch, tính bằng phút. */
interface Seg {
  weekday: number;
  startMin: number;
  endMin: number;
}

function midnightOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Cắt [s, e) theo ngày LỊCH (nửa đêm), không phải ngày logic.
 * "Work ngoài 08:00–17:00" nói về đồng hồ treo tường, nên mốc phải là 00:00.
 */
function calSegments(s: number, e: number): Seg[] {
  const out: Seg[] = [];
  let cur = s;
  // Chặn vòng lặp vô hạn nếu ai đó truyền vào khoảng vô lý.
  for (let guard = 0; cur < e && guard < 400; guard++) {
    const day0 = midnightOf(cur);
    const day1 = nextMidnight(cur);
    const stop = Math.min(e, day1);
    out.push({
      weekday: new Date(day0).getDay(),
      startMin: (cur - day0) / MIN,
      endMin: (stop - day0) / MIN,
    });
    cur = stop;
  }
  return out;
}

function overlapMin(seg: Seg, a: number, b: number): number {
  return Math.max(0, Math.min(seg.endMin, b) - Math.max(seg.startMin, a));
}

const isWeekend = (weekday: number) => weekday === 0 || weekday === 6;

/** Tổng giờ của một category rơi vào các khung giờ trong ngày. */
function hoursInWindows(
  sessions: Sess[],
  category: Category,
  windows: [number, number][],
  dayFilter?: (weekday: number) => boolean
): number {
  let min = 0;
  for (const s of sessions) {
    if (s.category !== category) continue;
    for (const seg of calSegments(s.start, s.end)) {
      if (dayFilter && !dayFilter(seg.weekday)) continue;
      for (const [a, b] of windows) min += overlapMin(seg, a, b);
    }
  }
  return min / 60;
}

/** Giờ NGOÀI một khung, trong các ngày được chọn. */
function hoursOutsideWindow(
  sessions: Sess[],
  category: Category,
  a: number,
  b: number,
  dayFilter?: (weekday: number) => boolean
): number {
  let min = 0;
  for (const s of sessions) {
    if (s.category !== category) continue;
    for (const seg of calSegments(s.start, s.end)) {
      if (dayFilter && !dayFilter(seg.weekday)) continue;
      min += seg.endMin - seg.startMin - overlapMin(seg, a, b);
    }
  }
  return min / 60;
}

// ---------------------------------------------------------------------------
// computeSignals
// ---------------------------------------------------------------------------

/**
 * @param expected    `expectedForRange()` của Stage 5 - target theo lịch
 * @param weekTargets target từng tuần; cần cho target NGÀY (`learnStreak`,
 *                    `weekendLearnTarget`) mà tổng `expected` không cho biết
 * @param previous    kỳ trước cùng độ dài (`previousRange`), có thể bỏ trống
 */
export function computeSignals(
  activities: Activity[],
  range: Range,
  expected: Record<Category, number>,
  weekTargets: Map<string, Record<Category, number>>,
  previous: PreviousPeriod | undefined,
  now: number
): Signals {
  const days = daysOf(range);
  const today = logicalDate(now);
  const elapsed = days.filter((d) => d <= today);

  const sessions = toSessions(activities, range, now);
  const byDay = hoursByDay(sessions, days);

  const actual = actualForRange(activities, range, now);
  const prevActual = previous
    ? actualForRange(previous.activities, previousRange(range), now)
    : null;

  const byCategory = {} as Record<Category, CatStat>;
  for (const c of CATEGORIES) {
    const own = sessions.filter((s) => s.category === c);
    const durations = own.map((s) => s.minutes);
    byCategory[c] = {
      actual: actual[c],
      expected: expected[c] ?? 0,
      deviationPct:
        (expected[c] ?? 0) > 0 ? (actual[c] - expected[c]) / expected[c] : null,
      deltaVsPrevious: prevActual ? actual[c] - prevActual[c] : null,
      sessions: own.length,
      medianSessionMin: round1(median(durations)),
      longestBlockMin: durations.length ? Math.round(Math.max(...durations)) : null,
      zeroDays: elapsed.filter((d) => (byDay.get(d)?.[c] ?? 0) <= 0).length,
    };
  }

  const nights = sleepNights(sessions);
  const preset = presetOf(range, weekTargets);

  return {
    from: range.from,
    to: range.to,
    rangeLabel: rangeLabel(range),
    dayCount: days.length,
    elapsedDays: elapsed.length,
    preset,
    coverage: coverageForRange(activities, range, now),
    overlapHours: overlapForRange(activities, range, now),
    recordCount: sessions.length,
    hasPrevious: previous != null,
    byCategory,
    sleep: sleepSignals(sessions, nights),
    work: workSignals(sessions, byDay, elapsed),
    learn: learnSignals(sessions, byDay, elapsed, weekTargets, range, today),
    fitness: fitnessSignals(sessions, byDay, elapsed, days.length, today),
    leisure: leisureSignals(sessions, nights),
    links: linkSignals({ byDay, elapsed, nights, sessions, actual, prevActual, previous }),
  };
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/** Preset của tuần đầu tiên trong khoảng, nếu nó khớp đúng một preset. */
function presetOf(
  range: Range,
  weekTargets: Map<string, Record<Category, number>>
): PresetId | null {
  const weekly = weekTargets.get(weekOf(range.from));
  if (!weekly) return null;
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p = PRESETS[id].weekly;
    if (CATEGORIES.every((c) => Math.abs(p[c] - weekly[c]) < 0.05)) return id;
  }
  return null;
}

function toSessions(activities: Activity[], range: Range, now: number): Sess[] {
  const winStart = dayWindow(range.from).start;
  const winEnd = Math.min(dayWindow(range.to).end, now);
  const out: Sess[] = [];

  for (const a of activities) {
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    const rawEnd = Math.min(a.endAt ?? now, now);
    const s = Math.max(a.startAt, winStart);
    const e = Math.min(rawEnd, winEnd);
    if (e <= s) continue;
    out.push({
      category: a.category,
      start: s,
      end: e,
      rawStart: a.startAt,
      rawEnd,
      day: logicalDate(a.startAt),
      minutes: (e - s) / MIN,
      fullHours: (rawEnd - a.startAt) / H,
    });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Giờ theo NGÀY LOGIC × category. Session vắt qua 04:00 bị chia cho hai ngày. */
function hoursByDay(sessions: Sess[], days: string[]): Map<string, Record<Category, number>> {
  const map = new Map<string, Record<Category, number>>();
  for (const d of days) map.set(d, zero());

  for (const s of sessions) {
    let cur = s.start;
    for (let guard = 0; cur < s.end && guard < 400; guard++) {
      const d = logicalDate(cur);
      const stop = Math.min(s.end, dayWindow(d).end);
      const row = map.get(d);
      if (row) row[s.category] += (stop - cur) / H;
      cur = stop;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Nhóm B - Sleep
// ---------------------------------------------------------------------------

interface Night {
  /** Ngày logic của đêm: ngủ 23:40 và ngủ 00:30 cùng thuộc một đêm. */
  day: string;
  bedMin: number; // trục đêm
  wakeMin: number;
  hours: number;
}

function sleepNights(sessions: Sess[]): Night[] {
  const best = new Map<string, Night>();
  for (const s of sessions) {
    if (s.category !== 'sleep' || s.fullHours <= NAP_MAX_H) continue;
    const n: Night = {
      day: s.day,
      bedMin: nightAxis(minutesOfDay(s.rawStart)),
      wakeMin: minutesOfDay(s.rawEnd),
      hours: s.fullHours,
    };
    // Hiếm khi có hai giấc dài cùng một đêm; nếu có thì lấy giấc dài hơn.
    const prev = best.get(s.day);
    if (!prev || n.hours > prev.hours) best.set(s.day, n);
  }
  return [...best.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

function sleepSignals(sessions: Sess[], nights: Night[]): SleepSignals {
  const naps = sessions.filter((s) => s.category === 'sleep' && s.fullHours <= NAP_MAX_H);
  const beds = nights.map((n) => n.bedMin);

  return {
    nights: nights.length,
    medianBedtime: round0(median(beds)),
    medianWakeTime: round0(median(nights.map((n) => n.wakeMin))),
    bedtimeSpreadMin:
      beds.length >= 2 ? Math.round(Math.max(...beds) - Math.min(...beds)) : null,
    nightsAfter23: nights.filter((n) => n.bedMin >= 23 * 60).length,
    medianSleepDuration: round1(median(nights.map((n) => n.hours))),
    shortNights: nights.filter((n) => n.hours < SHORT_NIGHT_H).length,
    napCount: naps.length,
    napHours: naps.reduce((a, s) => a + s.minutes / 60, 0),
  };
}

function round0(v: number | null): number | null {
  return v === null ? null : Math.round(v);
}

// ---------------------------------------------------------------------------
// Nhóm C - Work
// ---------------------------------------------------------------------------

const WORK_START = 8 * 60;
const WORK_END = 17 * 60;
const LATE_WORK = 20 * 60;
const OFFICE_START = 7 * 60 + 45;

/**
 * "Làm khuya" gồm cả phần tràn qua nửa đêm - mốc cắt ngày của app là 04:00,
 * nên 00:30 vẫn là buổi tối hôm trước, không phải sáng sớm hôm sau.
 */
const LATE_WINDOWS: [number, number][] = [
  [LATE_WORK, 1440],
  [0, 4 * 60],
];

function workSignals(
  sessions: Sess[],
  byDay: Map<string, Record<Category, number>>,
  elapsed: string[]
): WorkSignals {
  let longest: WorkSignals['longestWorkDay'] = null;
  let over10 = 0;
  for (const d of elapsed) {
    const h = byDay.get(d)?.work ?? 0;
    if (h > 10) over10++;
    if (h > 0 && (!longest || h > longest.hours)) {
      longest = { date: d, weekday: weekdayOf(d), hours: Math.round(h * 10) / 10 };
    }
  }

  // Giờ kết thúc Work của từng ngày lịch - dao động lớn nghĩa là hết giờ
  // làm mỗi hôm một khác, thứ mà tổng giờ Work không cho thấy.
  const ends = new Map<string, number>();
  const starts = new Set<string>();
  for (const s of sessions) {
    if (s.category !== 'work') continue;
    const dayKey = logicalDate(s.rawStart);
    const endMin = nightAxis(minutesOfDay(s.rawEnd));
    ends.set(dayKey, Math.max(ends.get(dayKey) ?? 0, endMin));
    if (minutesOfDay(s.rawStart) < OFFICE_START) starts.add(dayKey);
  }
  const endList = [...ends.values()];

  return {
    otHours: hoursOutsideWindow(sessions, 'work', WORK_START, WORK_END, (w) => !isWeekend(w)),
    weekendWorkHours: hoursInWindows(sessions, 'work', [[0, 1440]], isWeekend),
    lateWorkHours: hoursInWindows(sessions, 'work', LATE_WINDOWS),
    longestWorkDay: longest,
    daysOver10hWork: over10,
    officeDaysLogged: starts.size,
    workEndSpreadMin:
      endList.length >= 2 ? Math.round(Math.max(...endList) - Math.min(...endList)) : null,
  };
}

// ---------------------------------------------------------------------------
// Nhóm D - Learn
// ---------------------------------------------------------------------------

const MORNING_START = 4 * 60;
const MORNING_END = 8 * 60;
const MORNING_MARK = 7 * 60; // "có học buổi sáng" = bắt đầu trước 07:00
const EVENING_START = 20 * 60;
const EVENING_END = 23 * 60;
/** Đạt ngày học: từ 50% target ngày đó trở lên. */
export const STREAK_RATIO = 0.5;

function learnSignals(
  sessions: Sess[],
  byDay: Map<string, Record<Category, number>>,
  elapsed: string[],
  weekTargets: Map<string, Record<Category, number>>,
  range: Range,
  today: string
): LearnSignals {
  const learn = sessions.filter((s) => s.category === 'learn');

  const morningDays = new Set<string>();
  const eveningDays = new Set<string>();
  for (const s of learn) {
    if (minutesOfDay(s.rawStart) < MORNING_MARK) morningDays.add(s.day);
    for (const seg of calSegments(s.start, s.end)) {
      if (overlapMin(seg, EVENING_START, EVENING_END) > 0) eveningDays.add(s.day);
    }
  }

  // Target Learn của từng ngày - cần cho streak và target cuối tuần.
  const targetOf = (d: string) =>
    dailyTargetFor(weekdayOf(d), weekTargets.get(weekOf(d)) ?? PRESETS.normal.weekly).learn;

  let weekendTarget = 0;
  for (const d of elapsed) if (isWeekend(weekdayOf(d))) weekendTarget += targetOf(d);

  // Chuỗi tính NGƯỢC từ ngày cuối đã sống. Hôm nay còn dở dang thì bỏ qua:
  // 10 giờ sáng mà bắt so với target cả ngày thì chuỗi nào cũng đứt.
  let streak = 0;
  const walk = [...elapsed];
  if (range.isPartial && walk[walk.length - 1] === today) walk.pop();
  for (let i = walk.length - 1; i >= 0; i--) {
    const d = walk[i];
    const t = targetOf(d);
    const got = byDay.get(d)?.learn ?? 0;
    if (t > 0 && got < t * STREAK_RATIO) break;
    if (t <= 0 && got <= 0) break;
    streak++;
  }

  const durations = learn.map((s) => s.minutes);

  return {
    morningLearnDays: morningDays.size,
    morningLearnHours: hoursInWindows(sessions, 'learn', [[MORNING_START, MORNING_END]]),
    eveningLearnDays: eveningDays.size,
    eveningLearnHours: hoursInWindows(sessions, 'learn', [[EVENING_START, EVENING_END]]),
    weekendLearnHours: hoursInWindows(sessions, 'learn', [[0, 1440]], isWeekend),
    weekendLearnTarget: weekendTarget,
    learnStreak: streak,
    longestLearnBlockMin: durations.length ? Math.round(Math.max(...durations)) : null,
    daysWithZeroLearn: elapsed.filter((d) => (byDay.get(d)?.learn ?? 0) <= 0).length,
    weekdayWorstForLearn: worstWeekday(byDay, elapsed),
  };
}

/**
 * Thứ nào Learn thấp nhất. Cần đủ 7 ngày, nếu không thì "thứ Ba tệ nhất"
 * chỉ có nghĩa là "khoảng này chỉ có một thứ Ba".
 */
function worstWeekday(
  byDay: Map<string, Record<Category, number>>,
  elapsed: string[]
): { weekday: number; hours: number } | null {
  if (elapsed.length < 7) return null;
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const d of elapsed) buckets[weekdayOf(d)].push(byDay.get(d)?.learn ?? 0);

  let worst: { weekday: number; hours: number } | null = null;
  for (let w = 0; w < 7; w++) {
    if (buckets[w].length === 0) continue;
    const h = Math.round(mean(buckets[w]) * 10) / 10;
    if (!worst || h < worst.hours) worst = { weekday: w, hours: h };
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Nhóm E - Fitness
// ---------------------------------------------------------------------------

function fitnessSignals(
  sessions: Sess[],
  byDay: Map<string, Record<Category, number>>,
  elapsed: string[],
  dayCount: number,
  today: string
): FitnessSignals {
  const fit = sessions.filter((s) => s.category === 'fitness');
  const dist = [0, 0, 0, 0, 0, 0, 0];
  for (const s of fit) dist[weekdayOf(s.day)]++;

  const fitDays = [...new Set(fit.map((s) => s.day))].sort();
  let longestGap: number | null = null;
  for (let i = 1; i < fitDays.length; i++) {
    // `daysBetween` đếm cả hai đầu → trừ một để ra số ngày cách nhau.
    const gap = daysBetween(fitDays[i - 1], fitDays[i]) - 1;
    if (longestGap === null || gap > longestGap) longestGap = gap;
  }

  const last = fitDays[fitDays.length - 1];
  const weeks = dayCount / 7;

  return {
    sessions: fit.length,
    sessionsPerWeek: weeks > 0 ? fit.length / weeks : 0,
    longestGapDays: longestGap,
    daysSinceLast: last ? Math.max(0, daysBetween(last, today) - 1) : null,
    medianSessionMin: round1(median(fit.map((s) => s.minutes))),
    weekdayDistribution: dist,
    skippedAfterWorkDays: elapsed.filter((d) => {
      const row = byDay.get(d);
      return (row?.work ?? 0) > HIGH_WORK_H && (row?.fitness ?? 0) <= 0;
    }).length,
  };
}

// ---------------------------------------------------------------------------
// Nhóm F - Leisure
// ---------------------------------------------------------------------------

const LATE_LEISURE = 22 * 60;
const BEDTIME_LATE = 23 * 60;

function leisureSignals(sessions: Sess[], nights: Night[]): LeisureSignals {
  const lei = sessions.filter((s) => s.category === 'leisure');
  const durations = lei.map((s) => s.minutes);

  // Cùng lối tính với `lateWorkHours`, chỉ khác mốc giờ.
  const lateWindows: [number, number][] = [
    [LATE_LEISURE, 1440],
    [0, 4 * 60],
  ];

  const lateDays = new Set<string>();
  for (const s of lei) {
    let mins = 0;
    for (const seg of calSegments(s.start, s.end)) {
      for (const [a, b] of lateWindows) mins += overlapMin(seg, a, b);
    }
    if (mins > 0) lateDays.add(logicalDate(Math.max(s.start, s.rawStart)));
  }

  const lateBed = new Set(nights.filter((n) => n.bedMin >= BEDTIME_LATE).map((n) => n.day));

  return {
    hours: lei.reduce((a, s) => a + s.minutes / 60, 0),
    lateLeisureHours: hoursInWindows(sessions, 'leisure', lateWindows),
    // Phải có CẢ HAI: xem khuya mà vẫn ngủ đúng giờ thì không tính.
    leisureNightsDelayingSleep: [...lateDays].filter((d) => lateBed.has(d)).length,
    longestBlockMin: durations.length ? Math.round(Math.max(...durations)) : null,
    weekdayLeisureHours: hoursInWindows(sessions, 'leisure', [[0, 1440]], (w) => !isWeekend(w)),
    weekendLeisureHours: hoursInWindows(sessions, 'leisure', [[0, 1440]], isWeekend),
  };
}

// ---------------------------------------------------------------------------
// Nhóm G - Liên hệ chéo. Chỉ mô tả, không nhân quả. Dưới 3 mẫu → null.
// ---------------------------------------------------------------------------

function link(values: number[]): Link | null {
  if (values.length < MIN_SAMPLE) return null;
  return { value: Math.round(mean(values) * 10) / 10, sampleSize: values.length };
}

function linkSignals(i: {
  byDay: Map<string, Record<Category, number>>;
  elapsed: string[];
  nights: Night[];
  sessions: Sess[];
  actual: Record<Category, number>;
  prevActual: Record<Category, number> | null;
  previous: PreviousPeriod | undefined;
}): LinkSignals {
  const { byDay, elapsed, nights, sessions, actual, prevActual } = i;

  const high: number[] = [];
  const normal: number[] = [];
  for (const d of elapsed) {
    const row = byDay.get(d);
    if (!row) continue;
    (row.work > HIGH_WORK_H ? high : normal).push(row.learn);
  }

  // Ngày SAU một đêm ngắn. Mốc cắt 04:00 làm việc này gọn: đêm ngủ 23:00
  // của ngày d thuộc ngày d, còn ngày tỉnh táo tiếp theo là d+1.
  const shortNights = nights.filter((n) => n.hours < SHORT_NIGHT_H);
  const afterShortFitness: number[] = [];
  const afterShortLearn: number[] = [];
  for (const n of shortNights) {
    const next = byDay.get(addDays(n.day, 1));
    if (!next) continue;
    afterShortFitness.push(next.fitness);
    afterShortLearn.push(next.learn);
  }

  // Ngủ sau ngày có làm khuya.
  const lateWorkDays = new Set<string>();
  for (const s of sessions) {
    if (s.category !== 'work') continue;
    for (const seg of calSegments(s.start, s.end)) {
      for (const [a, b] of LATE_WINDOWS) if (overlapMin(seg, a, b) > 0) lateWorkDays.add(s.day);
    }
  }
  const sleepAfterLate = nights.filter((n) => lateWorkDays.has(n.day)).map((n) => n.hours);

  const weekendDays = elapsed.filter((d) => isWeekend(weekdayOf(d)));
  let wLearn = 0;
  let wWork = 0;
  for (const d of weekendDays) {
    const row = byDay.get(d);
    wLearn += row?.learn ?? 0;
    wWork += row?.work ?? 0;
  }

  return {
    learnOnHighWorkDays: link(high),
    learnOnNormalDays: link(normal),
    fitnessAfterShortNights: link(afterShortFitness),
    learnAfterShortNights: link(afterShortLearn),
    sleepAfterLateWork: link(sleepAfterLate),
    weekendLearnVsWeekendWork:
      weekendDays.length >= MIN_SAMPLE
        ? {
            learn: Math.round(wLearn * 10) / 10,
            work: Math.round(wWork * 10) / 10,
            sampleSize: weekendDays.length,
          }
        : null,
    displacedBy: displacedBy(actual, prevActual, elapsed.length),
  };
}

/** Đổi chỗ: category nào tăng nhiều nhất, category nào giảm nhiều nhất. */
const DISPLACE_MIN_H = 1;

function displacedBy(
  actual: Record<Category, number>,
  prev: Record<Category, number> | null,
  sampleSize: number
): LinkSignals['displacedBy'] {
  if (!prev || sampleSize < MIN_SAMPLE) return null;

  let up: Category | null = null;
  let down: Category | null = null;
  for (const c of CATEGORIES) {
    const d = actual[c] - prev[c];
    if (d > 0 && (up === null || d > actual[up] - prev[up])) up = c;
    if (d < 0 && (down === null || d < actual[down] - prev[down])) down = c;
  }
  if (!up || !down) return null;

  const upHours = actual[up] - prev[up];
  const downHours = actual[down] - prev[down];
  if (upHours < DISPLACE_MIN_H || -downHours < DISPLACE_MIN_H) return null;

  return {
    up,
    upHours: Math.round(upHours * 10) / 10,
    down,
    downHours: Math.round(downHours * 10) / 10,
    sampleSize,
  };
}
