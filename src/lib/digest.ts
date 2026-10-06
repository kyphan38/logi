// ---------------------------------------------------------------------------
// logi - The digest sent to the model (Stage 7 Task 2)
//
// The digest is the ONLY thing that leaves the user's device. No raw records,
// no user-typed labels, no ids. Only numbers already computed in `signals.ts`.
//
// This file does three things:
//   1. Packs `Signals` into compact JSON, every number rounded to 1 decimal
//   2. Drops null stats and correlations with sampleSize < 3
//   3. The `canAnalyze()` gate - thin data means NO API call
//
// Pure: usable on both client and server. Tested with `node --test`.
// ---------------------------------------------------------------------------
import { isThin } from '@/lib/log-quality';
import { MIN_SAMPLE, type Link, type Signals } from '@/lib/signals';
import { CATEGORIES, type Category } from '@/types/logi';

/** The digest is free-form JSON - the model reads the keys, no strict schema. */
export type Digest = Record<string, unknown>;

/** Fewer days than this leaves nothing to compare. */
export const MIN_DAYS = 3;
/** The plan's target size. Going over is a sign the digest is bloating with raw data. */
export const TOKEN_BUDGET = 1200;

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => Math.round(v * 100);

/** Minutes → "HH:MM". The night axis (>= 1440) is mapped back to a time of day. */
export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Drop null/undefined while building: the digest never has empty keys. */
function put(o: Digest, key: string, v: number | string | Digest | null | undefined): void {
  if (v === null || v === undefined) return;
  o[key] = typeof v === 'number' ? r1(v) : v;
}

function linkOf(l: Link | null): Digest | null {
  // Second guard: signals already returns null under 3 samples; check again here.
  if (!l || l.sampleSize < MIN_SAMPLE) return null;
  return { value: r1(l.value), n: l.sampleSize };
}

// ---------------------------------------------------------------------------
// Building the digest
// ---------------------------------------------------------------------------

export function buildDigest(s: Signals): Digest {
  const d: Digest = {};

  d.period = {
    label: s.rangeLabel,
    days: s.dayCount,
    loggedDays: s.elapsedDays,
    preset: s.preset ?? 'unknown',
    // Three raw numbers instead of a ratio against 24h (section 3.2). The model can
    // read "logged 62h, gaps 9h" but not what "68%" means.
    trackedHours: r1(s.logQuality.trackedHours),
    gapHours: r1(s.logQuality.gapHours),
    daysWithLog: s.logQuality.loggedDays,
    overlapHours: r1(s.overlapHours),
    sessions: s.recordCount,
  };

  // All 4 categories, even ones with nothing unusual - the model needs the full
  // picture to pick what is worth saying.
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

  // No sleep data (AMENDMENT-remove-sleep section 10). Every key here is about
  // LOGGED HOURS, not sleep. Key names must say so, or the model reads
  // `lastActivity` as "bedtime" and gives sleep advice.
  const dayShape: Digest = {};
  put(dayShape, 'daysWithAnyLog', s.night.daysWithActivity);
  put(dayShape, 'daysWithActivityAfter23', s.night.lateNightActivityDays);
  put(
    dayShape,
    'medianLastActivityEnd',
    s.night.lastActivityMedian === null ? null : hhmm(s.night.lastActivityMedian)
  );
  put(dayShape, 'lastActivityEndSpreadMin', s.night.lastActivitySpreadMin);
  put(dayShape, 'daysStartingBefore6', s.night.earlyStartDays);
  d.dayShape = dayShape;

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
  put(leisure, 'longestBlockMin', s.leisure.longestBlockMin);
  put(leisure, 'weekdayHours', s.leisure.weekdayLeisureHours);
  put(leisure, 'weekendHours', s.leisure.weekendLeisureHours);
  d.leisure = leisure;

  // Correlations: description only, each with `n`. Missing samples means absent.
  const links: Digest = {};
  put(links, 'learnHoursOnDaysWorkOver9h', linkOf(s.links.learnOnHighWorkDays));
  put(links, 'learnHoursOnOtherDays', linkOf(s.links.learnOnNormalDays));
  put(links, 'learnHoursAfterDaysActiveAfter23', linkOf(s.links.learnAfterLateNights));
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
// Hash & size
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit. No need to resist deliberate collisions - only to know
 * "did the data change" between two Analyse taps.
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

/** A rough estimate of ~4 characters per token. Enough to watch the prompt budget. */
export function estimateTokens(d: Digest): number {
  return Math.ceil(JSON.stringify(d).length / 4);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export interface Gate {
  ok: boolean;
  reason?: string;
  /** A hint on how to fix it, shown under the reason. */
  hint?: string;
}

/**
 * Failing → NO API call. Better to say "not enough data" than give notes based
 * on 40% of the truth.
 */
export function canAnalyze(s: Signals): Gate {
  if (s.recordCount === 0) {
    return {
      ok: false,
      reason: 'Nothing logged in this period.',
      hint: 'Pick a range where you have records.',
    };
  }
  // Days not yet lived do not count: "This month" on the 2nd has only 2 real days.
  if (s.elapsedDays < MIN_DAYS) {
    return {
      ok: false,
      reason: `Need at least ${MIN_DAYS} days of data.`,
      hint: 'Try a wider range.',
    };
  }
  // With very sparse logs, every conclusion rests on a small part of the truth.
  if (isThin(s.logQuality)) {
    const q = s.logQuality;
    return {
      ok: false,
      reason: `Only ${q.loggedDays} of ${q.totalDays} days are logged well enough.`,
      hint: 'Log more of your day, then try again.',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Extreme data (Task 8)
// ---------------------------------------------------------------------------

/** Work scaled to a week; above this, add one sentence. */
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
 * One neutral line for extreme data, written by CODE, not the AI.
 *
 * Bland on purpose: the comparison is the user's own target, not medical
 * advice. No diagnosis, no alarm, no red.
 * Returns null when all is normal - silence is the default.
 */
export function extremeNote(digest: Digest): string | null {
  const days = num(digest, 'period', 'days') ?? 0;

  // The sleep sentence went with the `sleep` category (AMENDMENT-remove-sleep section 10).
  // The app no longer tracks sleep, so it must say nothing about it.
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

/** Capitalized category name - reused in the UI when showing `metric`. */
export function categoryOf(key: string): Category | null {
  return (CATEGORIES as readonly string[]).includes(key) ? (key as Category) : null;
}
