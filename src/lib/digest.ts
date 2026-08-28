// ---------------------------------------------------------------------------
// logi - Digest gửi cho model (Stage 7 Task 2)
//
// Digest là thứ DUY NHẤT rời khỏi máy người dùng. Không record thô, không nhãn
// người dùng tự gõ, không id. Chỉ các con số đã tính sẵn ở `signals.ts`.
//
// Ba việc file này làm:
//   1. Gói `Signals` thành JSON gọn, mọi số làm tròn 1 chữ số
//   2. Bỏ chỉ số null và chỉ số liên hệ có sampleSize < 3
//   3. Cổng chặn `canAnalyze()` - dữ liệu mỏng thì KHÔNG gọi API
//
// Thuần: dùng được cả ở client lẫn server. Test bằng `node --test`.
// ---------------------------------------------------------------------------
import { MIN_SAMPLE, type Link, type Signals } from '@/lib/signals';
import { CATEGORIES, type Category } from '@/types/logi';

/** Digest là JSON tự do - model đọc key, không có schema cứng. */
export type Digest = Record<string, unknown>;

/** Coverage dưới mức này thì mọi kết luận đều không đáng tin. */
export const COVERAGE_FLOOR = 0.55;
/** Ít hơn ngần này ngày thì chưa có gì để so sánh. */
export const MIN_DAYS = 3;
/** Mục tiêu của plan. Vượt là dấu hiệu digest đang phình ra dữ liệu thô. */
export const TOKEN_BUDGET = 1200;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => Math.round(v * 100);

/** Phút → "HH:MM". Trục đêm (>= 1440) được đưa về giờ trong ngày. */
export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Bỏ null/undefined ngay lúc dựng: digest không chứa key rỗng. */
function put(o: Digest, key: string, v: number | string | Digest | null | undefined): void {
  if (v === null || v === undefined) return;
  o[key] = typeof v === 'number' ? r1(v) : v;
}

function linkOf(l: Link | null): Digest | null {
  // Chốt chặn thứ hai: signals đã trả null dưới 3 mẫu, ở đây kiểm lại.
  if (!l || l.sampleSize < MIN_SAMPLE) return null;
  return { value: r1(l.value), n: l.sampleSize };
}

// ---------------------------------------------------------------------------
// Dựng digest
// ---------------------------------------------------------------------------

export function buildDigest(s: Signals): Digest {
  const d: Digest = {};

  d.period = {
    label: s.rangeLabel,
    days: s.dayCount,
    loggedDays: s.elapsedDays,
    preset: s.preset ?? 'unknown',
    coveragePct: pct(s.coverage),
    overlapHours: r1(s.overlapHours),
    sessions: s.recordCount,
  };

  // Đủ cả 5 category, kể cả category không có gì bất thường - model cần thấy
  // toàn cảnh mới chọn đúng cái đáng nói.
  const totals: Digest = {};
  for (const c of CATEGORIES) {
    const st = s.byCategory[c];
    const row: Digest = {};
    put(row, 'hours', st.actual);
    put(row, 'targetHours', st.expected);
    put(row, 'deviationPct', st.deviationPct === null ? null : pct(st.deviationPct));
    put(row, 'vsPreviousHours', st.deltaVsPrevious);
    put(row, 'sessions', st.sessions);
    put(row, 'medianSessionMin', st.medianSessionMin);
    put(row, 'longestBlockMin', st.longestBlockMin);
    put(row, 'daysWithNone', st.zeroDays);
    totals[c] = row;
  }
  d.totals = totals;

  const sleep: Digest = {};
  put(sleep, 'nights', s.sleep.nights);
  put(sleep, 'medianBedtime', s.sleep.medianBedtime === null ? null : hhmm(s.sleep.medianBedtime));
  put(sleep, 'medianWakeTime', s.sleep.medianWakeTime === null ? null : hhmm(s.sleep.medianWakeTime));
  put(sleep, 'bedtimeSpreadMin', s.sleep.bedtimeSpreadMin);
  put(sleep, 'nightsAfter23', s.sleep.nightsAfter23);
  put(sleep, 'medianNightHours', s.sleep.medianSleepDuration);
  put(sleep, 'nightsUnder6h', s.sleep.shortNights);
  put(sleep, 'naps', s.sleep.napCount);
  put(sleep, 'napHours', s.sleep.napHours);
  d.sleep = sleep;

  const work: Digest = {};
  put(work, 'outsideOfficeHours', s.work.otHours);
  put(work, 'weekendHours', s.work.weekendWorkHours);
  put(work, 'after20Hours', s.work.lateWorkHours);
  put(
    work,
    'longestDay',
    s.work.longestWorkDay
      ? { weekday: WEEKDAY[s.work.longestWorkDay.weekday], hours: r1(s.work.longestWorkDay.hours) }
      : null
  );
  put(work, 'daysOver10h', s.work.daysOver10hWork);
  put(work, 'earlyStartDays', s.work.officeDaysLogged);
  put(work, 'endTimeSpreadMin', s.work.workEndSpreadMin);
  d.work = work;

  const learn: Digest = {};
  put(learn, 'morningDays', s.learn.morningLearnDays);
  put(learn, 'morningHours', s.learn.morningLearnHours);
  put(learn, 'eveningDays', s.learn.eveningLearnDays);
  put(learn, 'eveningHours', s.learn.eveningLearnHours);
  put(learn, 'weekendHours', s.learn.weekendLearnHours);
  put(learn, 'weekendTargetHours', s.learn.weekendLearnTarget);
  put(learn, 'streakDays', s.learn.learnStreak);
  put(learn, 'longestBlockMin', s.learn.longestLearnBlockMin);
  put(learn, 'daysWithNone', s.learn.daysWithZeroLearn);
  put(
    learn,
    'lowestWeekday',
    s.learn.weekdayWorstForLearn
      ? {
          weekday: WEEKDAY[s.learn.weekdayWorstForLearn.weekday],
          hours: r1(s.learn.weekdayWorstForLearn.hours),
        }
      : null
  );
  d.learn = learn;

  const byWeekday: Digest = {};
  s.fitness.weekdayDistribution.forEach((n, w) => {
    if (n > 0) byWeekday[WEEKDAY[w]] = n;
  });
  const fitness: Digest = {};
  put(fitness, 'sessions', s.fitness.sessions);
  put(fitness, 'sessionsPerWeek', s.fitness.sessionsPerWeek);
  put(fitness, 'longestGapDays', s.fitness.longestGapDays);
  put(fitness, 'daysSinceLast', s.fitness.daysSinceLast);
  put(fitness, 'medianSessionMin', s.fitness.medianSessionMin);
  if (Object.keys(byWeekday).length > 0) fitness.byWeekday = byWeekday;
  put(fitness, 'longWorkDaysWithNoSession', s.fitness.skippedAfterWorkDays);
  d.fitness = fitness;

  const leisure: Digest = {};
  put(leisure, 'hours', s.leisure.hours);
  put(leisure, 'after22Hours', s.leisure.lateLeisureHours);
  put(leisure, 'nightsWithLateLeisureAndLateBedtime', s.leisure.leisureNightsDelayingSleep);
  put(leisure, 'longestBlockMin', s.leisure.longestBlockMin);
  put(leisure, 'weekdayHours', s.leisure.weekdayLeisureHours);
  put(leisure, 'weekendHours', s.leisure.weekendLeisureHours);
  d.leisure = leisure;

  // Nhóm liên hệ: chỉ mô tả, mỗi mục kèm `n`. Thiếu mẫu thì không có mặt.
  const links: Digest = {};
  put(links, 'learnHoursOnDaysWorkOver9h', linkOf(s.links.learnOnHighWorkDays));
  put(links, 'learnHoursOnOtherDays', linkOf(s.links.learnOnNormalDays));
  put(links, 'fitnessHoursAfterNightsUnder6h', linkOf(s.links.fitnessAfterShortNights));
  put(links, 'learnHoursAfterNightsUnder6h', linkOf(s.links.learnAfterShortNights));
  put(links, 'sleepHoursAfterWorkPast20', linkOf(s.links.sleepAfterLateWork));
  if (s.links.weekendLearnVsWeekendWork && s.links.weekendLearnVsWeekendWork.sampleSize >= MIN_SAMPLE) {
    const w = s.links.weekendLearnVsWeekendWork;
    links.weekendLearnVsWork = { learnHours: r1(w.learn), workHours: r1(w.work), n: w.sampleSize };
  }
  if (s.links.displacedBy && s.links.displacedBy.sampleSize >= MIN_SAMPLE) {
    const x = s.links.displacedBy;
    links.biggestShiftVsPrevious = {
      up: x.up,
      upHours: r1(x.upHours),
      down: x.down,
      downHours: r1(x.downHours),
      n: x.sampleSize,
    };
  }
  if (Object.keys(links).length > 0) d.links = links;

  return d;
}

// ---------------------------------------------------------------------------
// Hash & kích thước
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit. Không cần chống va chạm có chủ đích - chỉ để biết
 * "dữ liệu có đổi không" giữa hai lần bấm Analyse.
 */
export function digestHash(d: Digest): string {
  const text = JSON.stringify(d);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Ước lượng thô ~4 ký tự một token. Đủ để canh ngân sách prompt. */
export function estimateTokens(d: Digest): number {
  return Math.ceil(JSON.stringify(d).length / 4);
}

// ---------------------------------------------------------------------------
// Cổng chặn
// ---------------------------------------------------------------------------

export interface Gate {
  ok: boolean;
  reason?: string;
  /** Câu gợi ý cách khắc phục, hiện dưới lý do. */
  hint?: string;
}

/**
 * Không đạt → KHÔNG gọi API. Thà nói "chưa đủ dữ liệu" còn hơn đưa ra
 * nhận xét dựa trên 40% sự thật.
 */
export function canAnalyze(s: Signals): Gate {
  if (s.recordCount === 0) {
    return {
      ok: false,
      reason: 'Nothing logged in this period.',
      hint: 'Pick a range where you have records.',
    };
  }
  // Ngày chưa sống thì không tính: "This month" ngày mùng 2 chỉ có 2 ngày thật.
  if (s.elapsedDays < MIN_DAYS) {
    return {
      ok: false,
      reason: `Need at least ${MIN_DAYS} days of data.`,
      hint: 'Try a wider range.',
    };
  }
  if (s.coverage < COVERAGE_FLOOR) {
    return {
      ok: false,
      reason: `Only ${pct(s.coverage)}% of this period is logged.`,
      hint: 'Log more of your day, then try again.',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dữ liệu cực đoan (Task 8)
// ---------------------------------------------------------------------------

/** Ngủ trung vị dưới mức này thì nói thêm một câu. */
export const EXTREME_SLEEP_H = 5;
/** Work quy đổi ra một tuần, trên mức này thì nói thêm một câu. */
export const EXTREME_WORK_H_PER_WEEK = 70;

function num(o: unknown, ...path: string[]): number | null {
  let cur: unknown = o;
  for (const k of path) {
    if (typeof cur !== 'object' || cur === null) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'number' ? cur : null;
}

/**
 * Một dòng trung tính cho dữ liệu cực đoan, do CODE viết chứ không phải AI.
 *
 * Cố ý nhạt: mốc so sánh là target do chính người dùng đặt, không phải
 * khuyến nghị y tế. Không chẩn đoán, không hoảng, không màu đỏ.
 * Trả null khi mọi thứ bình thường - im lặng là mặc định.
 */
export function extremeNote(digest: Digest): string | null {
  const days = num(digest, 'period', 'days') ?? 0;

  const median = num(digest, 'sleep', 'medianNightHours');
  if (median !== null && median < EXTREME_SLEEP_H) {
    const floor = num(digest, 'totals', 'sleep', 'targetHours');
    const tail = floor === null ? 'your own target' : `your own floor of ${Math.round(floor)}h`;
    return `Median night was ${median}h. That is well below ${tail}. Worth a rest week.`;
  }

  const work = num(digest, 'totals', 'work', 'hours');
  if (work !== null && days >= 1) {
    const perWeek = (work / days) * 7;
    if (perWeek > EXTREME_WORK_H_PER_WEEK) {
      const ceiling = num(digest, 'totals', 'work', 'targetHours');
      const tail =
        ceiling === null ? 'your own target' : `your own ceiling of ${Math.round(ceiling)}h`;
      return `Work came to ${Math.round(perWeek)}h a week. That is well above ${tail}. Worth a lighter week.`;
    }
  }

  return null;
}

/** Tên category viết hoa đầu - dùng lại ở UI khi hiện `metric`. */
export function categoryOf(key: string): Category | null {
  return (CATEGORIES as readonly string[]).includes(key) ? (key as Category) : null;
}
