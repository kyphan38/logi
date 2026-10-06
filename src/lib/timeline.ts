// ---------------------------------------------------------------------------
// logi - Timeline layout (History)
// Pure functions, no React. All block position math lives here.
// ---------------------------------------------------------------------------
import { clockTime } from '@/lib/datetime';
import { DAY_CUTOFF_HOUR, type Activity } from '@/types/logi';

/** Height of 1 hour (px) → 1 day = 1440px. */
export const HOUR_PX = 60;
export const DAY_MS = 24 * 3_600_000;

/** A short block is still at least 24px tall ⇒ it takes the space of 24 minutes. */
export const MIN_BLOCK_PX = 24;
const MIN_BLOCK_MS = (MIN_BLOCK_PX / HOUR_PX) * 3_600_000;

/** Gaps shorter than this are ignored. */
export const MIN_GAP_MS = 30 * 60_000;

export interface DayWindow {
  start: number; // 04:00 of the logical day
  end: number; // 04:00 the next day
}

/** "2026-08-26" → 04:00 → 04:00 the next day (local time). */
export function dayWindow(date: string): DayWindow {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, DAY_CUTOFF_HOUR, 0, 0, 0).getTime();
  return { start, end: start + DAY_MS };
}

/** "2026-08-26" + n days → "2026-08-27". */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export interface Segment {
  activity: Activity;
  start: number;
  /** The REAL end time, not cut at 04:00 the next day (see AMENDMENT sleep). */
  end: number;
  lane: number;
  /** The end falls on a different calendar day than the start → "→ next day" label. */
  crossesMidnight: boolean;
}

/** The calendar day (not logical day) of a time. */
function calendarDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface Layout {
  segments: Segment[];
  laneCount: number;
}

/**
 * Assigns lanes to overlapping blocks.
 *
 *   1. Sort by startAt ascending
 *   2. Find the first lane with lastEnd <= startAt
 *   3. None → open a new lane
 *
 * `lastEnd` uses the *displayed* height (at least 24px), or two back-to-back
 * 5-minute sessions would overlap on screen though their times do not.
 */
export function layoutDay(activities: Activity[], win: DayWindow, now: number): Layout {
  const segments: Segment[] = [];
  const lanes: number[] = []; // lastEnd of each lane

  const sorted = [...activities].sort((a, b) => a.startAt - b.startAt);

  for (const a of sorted) {
    // An unfinished session extends to now; a finished one keeps its REAL end
    // time, even past 04:00 the next day. One sleep is one row.
    const end = a.endAt ?? Math.min(now, win.end);
    const start = Math.max(a.startAt, win.start);
    if (end <= start) continue;

    let lane = lanes.findIndex((lastEnd) => lastEnd <= start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = Math.max(end, start + MIN_BLOCK_MS);

    segments.push({
      activity: a,
      start,
      end,
      lane,
      crossesMidnight: calendarDay(a.startAt) !== calendarDay(end),
    });
  }

  return { segments, laneCount: Math.max(1, lanes.length) };
}

export interface Gap {
  start: number;
  end: number;
}

export interface DayGaps {
  /** Hours actually logged (overlap merged). */
  trackedH: number;
  /** Empty hours BETWEEN the first and last activity. */
  gapH: number;
  gaps: Gap[];
  /** The timeline's left edge: the earliest activity. null = empty day. */
  from: number | null;
  /** The right edge: the latest activity, or `now` if today. */
  to: number | null;
}

const EMPTY_DAY: DayGaps = { trackedH: 0, gapH: 0, gaps: [], from: null, to: null };

/**
 * Gaps ONLY count between the first and last activity
 * (AMENDMENT-remove-sleep section 6).
 *
 * With Sleep gone, every day has a 22:00 -> 04:30 stretch nobody logs.
 * Counting it as "not logged" would show `6h 30m untracked` every day, looking
 * like forgotten logging when there was nothing to log. Time before the first
 * and after the last is neither shown nor counted.
 */
export function dayGaps(segments: Segment[], win: DayWindow, now: number): DayGaps {
  const limit = Math.min(win.end, Math.max(now, win.start));

  const inWin: Gap[] = [];
  for (const s of segments) {
    const start = Math.max(s.start, win.start);
    const end = Math.min(s.end, limit);
    if (end > start) inWin.push({ start, end });
  }
  if (inWin.length === 0) return EMPTY_DAY;

  inWin.sort((a, b) => a.start - b.start);

  // Left edge = earliest activity. Right edge = latest activity - except today:
  // the time from the last record to `now` really is unlogged time.
  // Past days stop at the last record, never extending to 04:00 the next day.
  const from = inWin[0].start;
  const lastEnd = Math.max(...inWin.map((g) => g.end));
  const isToday = now < win.end;
  const to = isToday ? Math.max(lastEnd, limit) : lastEnd;

  const merged: Gap[] = [];
  for (const g of inWin) {
    const last = merged[merged.length - 1];
    if (last && g.start <= last.end) last.end = Math.max(last.end, g.end);
    else merged.push({ start: g.start, end: g.end });
  }

  const trackedMs = merged.reduce((sum, m) => sum + (m.end - m.start), 0);

  const gaps: Gap[] = [];
  let cursor = from;
  for (const m of merged) {
    if (m.start - cursor >= MIN_GAP_MS) gaps.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (to - cursor >= MIN_GAP_MS) gaps.push({ start: cursor, end: to });

  return {
    trackedH: trackedMs / 3_600_000,
    gapH: Math.max(0, to - from - trackedMs) / 3_600_000,
    gaps,
    from,
    to,
  };
}

// ---------------------------------------------------------------------------
// Elastic layout (Stage 4.5)
//
// A linear 24h = 1440px scale for 5–8 records leaves most of the screen empty.
// Here blocks with data keep a readable height, and gaps shrink to one row.
// ---------------------------------------------------------------------------

/** Finger-tappable per iOS guidelines, even for a 5-minute session. */
export const ELASTIC_MIN_PX = 44;
/** A 6-hour study block must not fill the whole screen. */
export const ELASTIC_MAX_PX = 132;
export const ELASTIC_SLOPE = 0.22;
/** The "untracked" row - just tall enough to read, no more. */
export const GAP_ROW_PX = 32;

/**
 * Semi-proportional, clamped at both ends. Exact proportion is lost, but the
 * duration is always written on the block, so no information is lost.
 */
export function blockHeight(durationMs: number): number {
  const min = durationMs / 60_000;
  const raw = ELASTIC_MIN_PX + (min - 30) * ELASTIC_SLOPE;
  return Math.min(ELASTIC_MAX_PX, Math.max(ELASTIC_MIN_PX, raw));
}

export interface BlockRow {
  kind: 'blocks';
  key: string;
  start: number;
  height: number;
  /** Same time window → side by side, sharing the width evenly. */
  blocks: Segment[];
}

export interface GapRow {
  kind: 'gap';
  key: string;
  start: number;
  end: number;
}

export type Row = BlockRow | GapRow;

/**
 * Groups overlapping segments into clusters, then merges them with gaps in
 * time order. No more `position: absolute` - lower blocks stay tappable.
 *
 * `gaps` comes straight from `dayGaps()`, so it already drops today's future
 * part, gaps under 30 minutes, and both unlogged ends of the day.
 */
export function elasticRows(segments: Segment[], gaps: Gap[]): Row[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.lane - b.lane);

  const clusters: Segment[][] = [];
  let reach = -Infinity;
  for (const s of sorted) {
    if (s.start < reach && clusters.length > 0) clusters[clusters.length - 1].push(s);
    else clusters.push([s]);
    reach = Math.max(reach, s.end);
  }

  const blockRows: BlockRow[] = clusters.map((blocks) => ({
    kind: 'blocks',
    key: `b${blocks[0].start}-${blocks[0].activity.id}`,
    start: blocks[0].start,
    // Row height = the tallest block in the group.
    height: Math.max(...blocks.map((b) => blockHeight(b.end - b.start))),
    blocks: [...blocks].sort((a, b) => a.lane - b.lane),
  }));

  const gapRows: GapRow[] = gaps.map((g) => ({
    kind: 'gap',
    key: `g${g.start}`,
    start: g.start,
    end: g.end,
  }));

  return [...blockRows, ...gapRows].sort((a, b) => a.start - b.start);
}

/** Time → px coordinate in the 1440px frame. */
export function toPx(ts: number, win: DayWindow): number {
  return ((ts - win.start) / 3_600_000) * HOUR_PX;
}

/** "10:00 PM – 4:30 AM". The "→ next day" label and duration are drawn separately in Timeline. */
export function formatClockRange(start: number, end: number): string {
  return `${clockTime(start)} – ${clockTime(end)}`;
}

export function formatGap(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
