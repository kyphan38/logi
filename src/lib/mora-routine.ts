// ============================================================
// logi - Today's routine for mora (read + tick).
// Pure: builds the list mora shows and checks a tick request. The route
// (src/app/api/ingest/mora/routine) does auth and Firestore.
// ============================================================

import { cleanItem, routineForDay } from '@/lib/routine';
import type { Category, RoutineChecks, RoutineGroup } from '@/types/logi';

export interface RoutineSnapshotItem {
  id: string;
  text: string;
  group: string;
  minutes: number | null;
  category: Category | null;
  done: boolean;
}

export interface RoutineSnapshot {
  date: string;
  items: RoutineSnapshotItem[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Weekday of a "YYYY-MM-DD" logical day (0 = Sun). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** One flat list in group order, the same items Now shows for `date`. */
export function routineSnapshot(groups: RoutineGroup[], checks: RoutineChecks, date: string): RoutineSnapshot {
  const day = routineForDay(groups, weekdayOf(date), (id) => id in checks.checked);
  const items: RoutineSnapshotItem[] = [];
  for (const { group, items: list } of day) {
    for (const raw of list) {
      const i = cleanItem(raw);
      items.push({
        id: i.id,
        text: i.text,
        group: group.title,
        minutes: i.minutes ?? null,
        category: i.category ?? null,
        done: i.id in checks.checked,
      });
    }
  }
  return { date, items };
}

export type RoutineRequest = { action: 'get' } | { action: 'tick'; date: string; itemId: string; on: boolean };

/** Throws Error with a short reason on a bad request. */
export function readRoutineRequest(body: unknown): RoutineRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.action === 'get' || b.action === undefined) return { action: 'get' };
  if (b.action !== 'tick') throw new Error('bad-action');
  if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) throw new Error('bad-date');
  if (typeof b.itemId !== 'string' || !ID_RE.test(b.itemId)) throw new Error('bad-id');
  if (typeof b.on !== 'boolean') throw new Error('bad-on');
  return { action: 'tick', date: b.date, itemId: b.itemId, on: b.on };
}
