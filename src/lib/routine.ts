// ---------------------------------------------------------------------------
// logi - Routine: a daily checklist (Stage 10)
//
// Ticks first. An item may also carry a planned length and a category, so it
// can be started as a session from Now. The template repeats by weekday until
// the user edits it.
//
// Pure file: no React, no Firestore - tested with `node --test`.
// ---------------------------------------------------------------------------
import {
  CATEGORIES,
  ROUTINE_ITEM_MAX,
  type Category,
  type RoutineGroup,
  type RoutineItem,
} from '@/types/logi';

/** Monday → Sunday. Values per `Date.getDay()` (0 = Sun). */
export const GRID_DOWS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_SHORT: Record<number, string> = { ...SHORT };
export const DOW_LETTER: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };

export interface RoutineDayGroup {
  group: RoutineGroup;
  items: RoutineItem[];
  done: number;
}

/** Items for one weekday, kept in group order. */
export function itemsForDay(group: RoutineGroup, dow: number): RoutineItem[] {
  return group.items.filter((i) => i.days.includes(dow));
}

/**
 * One day's checklist for Now.
 *
 * A group empty today is dropped (e.g. a rest day). Ticks of items removed
 * from the template stay in the day doc but are not counted - only shown items count.
 */
export function routineForDay(
  groups: RoutineGroup[],
  dow: number,
  isChecked: (itemId: string) => boolean
): RoutineDayGroup[] {
  const out: RoutineDayGroup[] = [];
  for (const group of groups) {
    const items = itemsForDay(group, dow);
    if (items.length === 0) continue;
    const done = items.filter((i) => isChecked(i.id)).length;
    out.push({ group, items, done });
  }
  return out;
}

/** Invalid weekdays dropped, duplicates merged, sorted Mon → Sun for reading. */
export function cleanDays(days: number[]): number[] {
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return GRID_DOWS.filter((d) => set.has(d));
}

export function cleanText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, ROUTINE_ITEM_MAX);
}

/** Length chips in the item sheet, in minutes. */
export const MINUTE_PRESETS: readonly number[] = [25, 50, 90, 120];

/** Longest custom length. A session over 15h is blocked anyway. */
export const ROUTINE_MINUTES_MAX = 600;

/** Whole minutes in 1..600, else null (no timer). */
export function cleanMinutes(m: unknown): number | null {
  if (typeof m !== 'number' || !Number.isFinite(m)) return null;
  const r = Math.round(m);
  return r >= 1 && r <= ROUTINE_MINUTES_MAX ? r : null;
}

export function cleanCategory(c: unknown): Category | null {
  return (CATEGORIES as readonly unknown[]).includes(c) ? (c as Category) : null;
}

/** "25m" / "1.5h" / "2h" / "1h 10m". */
export function minutesLabel(m: number): string {
  if (m < 60) return `${m}m`;
  if (m % 30 === 0) return `${m / 60}h`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * The one shape written to Firestore. Optional fields are left out when empty:
 * Firestore rejects `undefined`, and old items stay byte-for-byte the same.
 */
export function cleanItem(i: RoutineItem): RoutineItem {
  const out: RoutineItem = { id: i.id, text: cleanText(i.text), days: cleanDays(i.days) };
  const minutes = cleanMinutes(i.minutes);
  const category = cleanCategory(i.category);
  if (minutes !== null) out.minutes = minutes;
  if (category !== null) out.category = category;
  return out;
}

/** Adds or edits an item. An item with no days left is kept, just not shown. */
export function upsertItem(items: RoutineItem[], next: RoutineItem): RoutineItem[] {
  const item = cleanItem(next);
  const i = items.findIndex((x) => x.id === item.id);
  if (i === -1) return [...items, item];
  const out = items.slice();
  out[i] = item;
  return out;
}

export function removeItem(items: RoutineItem[], id: string): RoutineItem[] {
  return items.filter((x) => x.id !== id);
}

/**
 * Swaps an item with its neighbor ON THE SAME DAY being viewed.
 *
 * Items of other days in between are skipped: the user only sees one day's
 * list, so "up one row" must be the row they see.
 */
export function moveItem(
  items: RoutineItem[],
  id: string,
  dir: -1 | 1,
  dow: number | null
): RoutineItem[] {
  const visible = (x: RoutineItem) => dow === null || x.days.includes(dow);
  const from = items.findIndex((x) => x.id === id);
  if (from === -1) return items;
  let to = from + dir;
  while (to >= 0 && to < items.length && !visible(items[to])) to += dir;
  if (to < 0 || to >= items.length) return items;
  const out = items.slice();
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

/** "Mon, Wed, Fri" / "Every day" / "Weekdays" - for the All view. */
export function daysLabel(days: number[]): string {
  const d = cleanDays(days);
  if (d.length === 0) return 'No day';
  if (d.length === 7) return 'Every day';
  if (d.length === 5 && d.every((x) => x >= 1 && x <= 5)) return 'Weekdays';
  if (d.length === 2 && d.includes(0) && d.includes(6)) return 'Weekends';
  return d.map((x) => SHORT[x]).join(', ');
}

