// Day plan (G1): time blocks for a weekday, a Saturday and a Sunday, compared
// with what was logged. Pure: no React, no Firebase.

import { dayWindow } from '@/lib/timeline';
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

export interface PlanBlock {
  /** "19:00", 24-hour. */
  start: string;
  /** "21:00". Before 04:00 means after midnight, the same logical day. */
  end: string;
  category: Category;
}

export const PLAN_DAYS = ['weekday', 'saturday', 'sunday'] as const;
export type PlanDay = (typeof PLAN_DAYS)[number];
export type DayPlan = Record<PlanDay, PlanBlock[]>;

export const PLAN_DAY_LABEL: Record<PlanDay, string> = { weekday: 'Mon-Fri', saturday: 'Sat', sunday: 'Sun' };
export const EMPTY_PLAN: DayPlan = { weekday: [], saturday: [], sunday: [] };
export const MAX_BLOCKS = 16;

const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const CUTOFF = 4 * 60;

/** "01:30" → 1530: minutes after 00:00 of the logical day, past midnight above 1440. */
export function planMinute(clock: string): number {
  const [h = 0, m = 0] = clock.split(':').map(Number);
  const v = h * 60 + m;
  return v < CUTOFF ? v + 1440 : v;
}

export function blockHours(b: PlanBlock): number {
  return Math.max(0, planMinute(b.end) - planMinute(b.start)) / 60;
}

/** A valid block, or null. The end must come after the start within the logical day. */
export function cleanBlock(raw: unknown): PlanBlock | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (typeof d.start !== 'string' || typeof d.end !== 'string' || !CLOCK.test(d.start) || !CLOCK.test(d.end)) return null;
  const category = CATEGORIES.find((c) => c === d.category);
  if (!category) return null;
  const b = { start: d.start, end: d.end, category };
  return blockHours(b) > 0 ? b : null;
}

const byStart = (a: PlanBlock, b: PlanBlock) => planMinute(a.start) - planMinute(b.start);

export function cleanPlan(raw: unknown): DayPlan {
  const d = (raw ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_PLAN };
  for (const day of PLAN_DAYS) {
    const list = Array.isArray(d[day]) ? (d[day] as unknown[]) : [];
    out[day] = list
      .map(cleanBlock)
      .filter((b): b is PlanBlock => b !== null)
      .sort(byStart)
      .slice(0, MAX_BLOCKS);
  }
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function planDayOf(weekday: number): PlanDay {
  return weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday';
}

/** Epoch times of a block on a logical date. */
export function blockWindow(date: string, b: PlanBlock): { start: number; end: number } {
  const base = dayWindow(date).start - CUTOFF * 60_000;
  return { start: base + planMinute(b.start) * 60_000, end: base + planMinute(b.end) * 60_000 };
}

function overlapH(a: Activity, from: number, to: number, now: number): number {
  if (a.status === 'abandoned' || a.status === 'scheduled') return 0;
  const s = Math.max(a.startAt, from);
  const e = Math.min(a.endAt ?? now, to);
  return e > s ? (e - s) / 3_600_000 : 0;
}

export interface BlockResult {
  block: PlanBlock;
  /** Planned hours so far (a block later today counts only up to now). */
  planned: number;
  /** Hours of the same category logged inside the block. */
  did: number;
}

export interface PlanCompare {
  blocks: BlockResult[];
  /** "plan 5h learn · did 3h", one per category in the plan. */
  lines: string[];
  /** The block with the most missed hours, if over 15 minutes. */
  biggest: BlockResult | null;
}

const fmt = (n: number) => `${Math.round(n * 10) / 10}h`;

export function comparePlan(blocks: PlanBlock[], activities: Activity[], date: string, now: number): PlanCompare {
  const results = blocks.map((block) => {
    const w = blockWindow(date, block);
    const end = Math.min(w.end, now);
    const planned = Math.max(0, end - w.start) / 3_600_000;
    const did = activities
      .filter((a) => a.category === block.category)
      .reduce((t, a) => t + overlapH(a, w.start, end, now), 0);
    return { block, planned, did };
  });

  // "did" per category is all logged time that day, not only inside blocks.
  const lines: string[] = [];
  for (const c of CATEGORIES) {
    const plan = results.filter((r) => r.block.category === c).reduce((t, r) => t + blockHours(r.block), 0);
    if (plan === 0) continue;
    const win = dayWindow(date);
    const did = activities.filter((a) => a.category === c).reduce((t, a) => t + overlapH(a, win.start, Infinity, now), 0);
    lines.push(`plan ${fmt(plan)} ${CATEGORY_LABEL[c].toLowerCase()} · did ${fmt(did)}`);
  }

  let biggest: BlockResult | null = null;
  for (const r of results) {
    const miss = r.planned - r.did;
    if (miss > 0.25 && (!biggest || miss > biggest.planned - biggest.did)) biggest = r;
  }
  return { blocks: results, lines, biggest };
}
