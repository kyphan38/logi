// ---------------------------------------------------------------------------
// logi - Deterministic stats for AI Insights (Stage 7 Task 1)
//
// Stage 7's fixed rule:
//
//     Code computes. The AI only interprets and picks what is worth saying.
//
// This file is the "code computes" part. Every number the model may write
// must be produced here first. The model never sees raw records.
//
// Pure: no React, no Firestore, no Gemini. Tested with `node --test`.
// Reuses `logi.ts` / `balance.ts` without changing them.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { dailyTargetFor } from '@/lib/day-target';
import { logQuality, type LogQuality } from '@/lib/log-quality';
import { actualForRange, overlapForRange } from '@/lib/range-target';
import { daysBetween, daysOf, rangeLabel, weekOf, weekdayOf, type Range } from '@/lib/range';
import { addDays, dayWindow } from '@/lib/timeline';
import {
  CATEGORIES,
  DAY_CUTOFF_HOUR,
  PRESETS,
  type Activity,
  type Category,
  type PresetId,
} from '@/types/logi';

const H = 3_600_000;
const MIN = 60_000;

/** Below this many samples every cross-correlation is chance → return `null`. */
export const MIN_SAMPLE = 3;

/** A heavy Work day: over 9h. For group G and `skippedAfterWorkDays`. */
export const HIGH_WORK_H = 9;

/**
 * No sleep data anymore (AMENDMENT-remove-sleep section 10), so LATE ACTIVITY
 * is used as an indirect signal. Whether the last activity ends at 22:00 or
 * 01:00 says a lot, though less precisely than a real bedtime.
 */
export const LATE_NIGHT_MIN = 23 * 60;
/** Starting the day before this mark counts as early. */
export const EARLY_START_MIN = 6 * 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Group A - every category gets the same set of stats, no favorites. */
export interface CatStat {
  actual: number;
  expected: number;
  /** (actual − expected) / expected. No target → null. */
  deviationPct: number | null;
  /** Hour change versus the previous period. No previous period → null. */
  deltaVsPrevious: number | null;
  sessions: number;
  medianSessionMin: number | null;
  longestBlockMin: number | null;
  zeroDays: number;
}

/**
 * Group B - Day rhythm, replacing the old Sleep group.
 *
 * Every number here measures LOGGED ACTIVITY, never inferred sleep. The app
 * does not know when the user sleeps and must not guess.
 */
export interface NightSignals {
  /** Days with any activity reaching past 23:00. */
  lateNightActivityDays: number;
  /** Median end time of the last activity, minutes on the logical-day axis. */
  lastActivityMedian: number | null;
  /** Spread of that time, in minutes. */
  lastActivitySpreadMin: number | null;
  /** Days whose first activity starts before 06:00. */
  earlyStartDays: number;
  /** Days with logs, the denominator for reading the four numbers above. */
  daysWithActivity: number;
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
  longestBlockMin: number | null;
  weekdayLeisureHours: number;
  weekendLeisureHours: number;
}

/** Every group G stat must carry `sampleSize`. */
export interface Link {
  value: number;
  sampleSize: number;
}

export interface LinkSignals {
  learnOnHighWorkDays: Link | null;
  learnOnNormalDays: Link | null;
  /** How much Learn happened on the day AFTER a day with activity past 23:00. */
  learnAfterLateNights: Link | null;
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
  /** Days actually lived in the range - tomorrow cannot have zeroDays. */
  elapsedDays: number;
  preset: PresetId | null;
  /** The range's log quality (section 3.2). Replaces the old ratio against 24h. */
  logQuality: LogQuality;
  overlapHours: number;
  recordCount: number;
  hasPrevious: boolean;
  byCategory: Record<Category, CatStat>;
  night: NightSignals;
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
 * The previous range, same length. For `deltaVsPrevious` and `displacedBy`.
 * Kept separate so the UI queries exactly the window `computeSignals` expects.
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
// Internal helpers
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
 * The LOGICAL DAY axis: minutes in the day, but hours before the 04:00 cut are
 * pushed to the end. 06:00 → 360, 23:30 → 1410, 01:00 → 1500.
 *
 * Needed to compare two times within one logical day. Without it "last
 * activity at 01:00" becomes 60 minutes, earlier than 06:00 - completely
 * wrong. Values always sit in [240, 1679], so median and spread keep order.
 */
function dayAxis(min: number): number {
  return min < DAY_CUTOFF_HOUR * 60 ? min + 1440 : min;
}

/** A session clipped to the range window. */
interface Sess {
  category: Category;
  /** Clipped. */
  start: number;
  end: number;
  /** Original - for bedtime / wake time. */
  rawStart: number;
  rawEnd: number;
  /** The logical day of the start time. */
  day: string;
  minutes: number;
  fullHours: number;
}

/** A slice of a session within ONE calendar day, in minutes. */
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
 * Splits [s, e) by CALENDAR day (midnight), not logical day.
 * "Work outside 08:00–17:00" is about the wall clock, so the cut is 00:00.
 */
function calSegments(s: number, e: number): Seg[] {
  const out: Seg[] = [];
  let cur = s;
  // Guards against an infinite loop if someone passes a nonsense range.
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

/** Total hours of a category falling into given hours of the day. */
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

/** Hours OUTSIDE a window, on the chosen days. */
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
 * @param expected    Stage 5's `expectedForRange()` - the calendar target
 * @param weekTargets per-week targets; needed for DAILY targets (`learnStreak`,
 *                    `weekendLearnTarget`) that the `expected` total cannot give
 * @param previous    the previous same-length period (`previousRange`), optional
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

  const edges = dayEdges(sessions);
  const preset = presetOf(range, weekTargets);

  return {
    from: range.from,
    to: range.to,
    rangeLabel: rangeLabel(range),
    dayCount: days.length,
    elapsedDays: elapsed.length,
    preset,
    logQuality: logQuality(activities, range, now),
    overlapHours: overlapForRange(activities, range, now),
    recordCount: sessions.length,
    hasPrevious: previous != null,
    byCategory,
    night: nightSignals(edges),
    work: workSignals(sessions, byDay, elapsed),
    learn: learnSignals(sessions, byDay, elapsed, weekTargets, range, today),
    fitness: fitnessSignals(sessions, byDay, elapsed, days.length, today),
    leisure: leisureSignals(sessions),
    links: linkSignals({ byDay, elapsed, edges, actual, prevActual, previous }),
  };
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/** The preset of the range's first week, if it matches exactly one preset. */
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

/** Hours per LOGICAL DAY × category. A session crossing 04:00 is split across two days. */
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
// Group B - Day rhythm (replaces the Sleep group)
// ---------------------------------------------------------------------------

/** A logical day with logs, reduced to its two ends. */
interface DayEdges {
  day: string;
  /** Start minute of the EARLIEST activity, on the logical-day axis. */
  firstStartMin: number;
  /** End minute of the LATEST activity, on the logical-day axis. */
  lastEndMin: number;
  /** Whether any activity reaches past 23:00. */
  late: boolean;
}

/**
 * The two ends of each logical day.
 *
 * Grouped by `s.day` (the logical day of `startAt`), per section 7: a
 * 23:00 → 01:00 session belongs entirely to the previous day, so it extends
 * that day's `lastEndMin` rather than starting the next day.
 */
function dayEdges(sessions: Sess[]): DayEdges[] {
  const map = new Map<string, DayEdges>();

  for (const s of sessions) {
    // Both ends on the logical-day axis: only then can 05:00 and 01:00 of the
    // same day be compared.
    const startMin = dayAxis(minutesOfDay(s.rawStart));
    const endMin = dayAxis(minutesOfDay(s.rawEnd));
    const late = endMin >= LATE_NIGHT_MIN;

    const prev = map.get(s.day);
    if (!prev) {
      map.set(s.day, { day: s.day, firstStartMin: startMin, lastEndMin: endMin, late });
      continue;
    }
    prev.firstStartMin = Math.min(prev.firstStartMin, startMin);
    prev.lastEndMin = Math.max(prev.lastEndMin, endMin);
    prev.late = prev.late || late;
  }

  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

function nightSignals(edges: DayEdges[]): NightSignals {
  const ends = edges.map((e) => e.lastEndMin);

  return {
    lateNightActivityDays: edges.filter((e) => e.late).length,
    lastActivityMedian: round0(median(ends)),
    lastActivitySpreadMin:
      ends.length >= 2 ? Math.round(Math.max(...ends) - Math.min(...ends)) : null,
    earlyStartDays: edges.filter((e) => e.firstStartMin < EARLY_START_MIN).length,
    daysWithActivity: edges.length,
  };
}

function round0(v: number | null): number | null {
  return v === null ? null : Math.round(v);
}

// ---------------------------------------------------------------------------
// Group C - Work
// ---------------------------------------------------------------------------

const WORK_START = 8 * 60;
const WORK_END = 17 * 60;
const LATE_WORK = 20 * 60;
const OFFICE_START = 7 * 60 + 45;

/**
 * "Late work" includes the part past midnight - the app's day cut is 04:00,
 * so 00:30 is still the evening before, not early next morning.
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

  // Work end time per calendar day - a wide spread means a different finish
  // every day, which total Work hours do not show.
  const ends = new Map<string, number>();
  const starts = new Set<string>();
  for (const s of sessions) {
    if (s.category !== 'work') continue;
    const dayKey = logicalDate(s.rawStart);
    const endMin = dayAxis(minutesOfDay(s.rawEnd));
    ends.set(dayKey, Math.max(ends.get(dayKey) ?? 0, endMin));
    // Same axis as `endMin`: a shift starting at 01:00 is late work, not an
    // early start.
    if (dayAxis(minutesOfDay(s.rawStart)) < OFFICE_START) starts.add(dayKey);
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
// Group D - Learn
// ---------------------------------------------------------------------------

const MORNING_START = 4 * 60;
const MORNING_END = 8 * 60;
const MORNING_MARK = 7 * 60; // "studied in the morning" = started before 07:00
const EVENING_START = 20 * 60;
const EVENING_END = 23 * 60;
/** A study day counts: 50% or more of that day's target. */
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

  // Each day's Learn target - needed for the streak and the weekend target.
  const targetOf = (d: string) =>
    dailyTargetFor(weekdayOf(d), weekTargets.get(weekOf(d)) ?? PRESETS.normal.weekly).learn;

  let weekendTarget = 0;
  for (const d of elapsed) if (isWeekend(weekdayOf(d))) weekendTarget += targetOf(d);

  // The streak counts BACK from the last lived day. An unfinished today is
  // skipped: at 10 am against a full day's target every streak would break.
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
 * The weekday with the lowest Learn. Needs all 7 days, otherwise "Tuesday is
 * worst" only means "this range has one Tuesday".
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
// Group E - Fitness
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
    // `daysBetween` counts both ends → subtract one for the gap in days.
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
// Group F - Leisure
// ---------------------------------------------------------------------------

const LATE_LEISURE = 22 * 60;

function leisureSignals(sessions: Sess[]): LeisureSignals {
  const lei = sessions.filter((s) => s.category === 'leisure');
  const durations = lei.map((s) => s.minutes);

  // Same method as `lateWorkHours`, only a different time mark.
  const lateWindows: [number, number][] = [
    [LATE_LEISURE, 1440],
    [0, 4 * 60],
  ];

  return {
    hours: lei.reduce((a, s) => a + s.minutes / 60, 0),
    lateLeisureHours: hoursInWindows(sessions, 'leisure', lateWindows),
    // `leisureNightsDelayingSleep` was removed (section 10): no sleep data to say
    // late watching delays sleep. `lateLeisureHours` is the raw number that still holds.
    longestBlockMin: durations.length ? Math.round(Math.max(...durations)) : null,
    weekdayLeisureHours: hoursInWindows(sessions, 'leisure', [[0, 1440]], (w) => !isWeekend(w)),
    weekendLeisureHours: hoursInWindows(sessions, 'leisure', [[0, 1440]], isWeekend),
  };
}

// ---------------------------------------------------------------------------
// Group G - Cross-correlations. Description only, no causation. Under 3 samples → null.
// ---------------------------------------------------------------------------

function link(values: number[]): Link | null {
  if (values.length < MIN_SAMPLE) return null;
  return { value: Math.round(mean(values) * 10) / 10, sampleSize: values.length };
}

function linkSignals(i: {
  byDay: Map<string, Record<Category, number>>;
  elapsed: string[];
  edges: DayEdges[];
  actual: Record<Category, number>;
  prevActual: Record<Category, number> | null;
  previous: PreviousPeriod | undefined;
}): LinkSignals {
  const { byDay, elapsed, edges, actual, prevActual } = i;

  const high: number[] = [];
  const normal: number[] = [];
  for (const d of elapsed) {
    const row = byDay.get(d);
    if (!row) continue;
    (row.work > HIGH_WORK_H ? high : normal).push(row.learn);
  }

  // The day AFTER a day with activity past 23:00. Replaces the old
  // `learnAfterShortNights`: no sleep data, but "up late yesterday" is still measurable.
  // Description only, no causal claim.
  const afterLateNightLearn: number[] = [];
  for (const e of edges) {
    if (!e.late) continue;
    const next = byDay.get(addDays(e.day, 1));
    if (!next) continue;
    afterLateNightLearn.push(next.learn);
  }

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
    learnAfterLateNights: link(afterLateNightLearn),
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

/** Displacement: which category rose most, which fell most. */
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
