// ---------------------------------------------------------------------------
// logi - Firestore for Routine (Stage 10)
//
// The logic lives in `@/lib/routine`. This file only reads and writes.
//
//   - routines/{groupId}: the template. Deleting a group = `archivedAt`, like events.
//   - routineChecks/{logicalDate}: one day's ticks. A new day = a new doc.
// ---------------------------------------------------------------------------
import {
  addDoc,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import { cleanDays, cleanText } from '@/lib/routine';
import {
  ROUTINE_TITLE_MAX,
  type RoutineChecks,
  type RoutineGroup,
  type RoutineItem,
} from '@/types/logi';

export class RoutineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutineError';
  }
}

const groupCol = (uid: string) => collection(db, 'users', uid, 'routines');
const groupRef = (uid: string, id: string) => doc(db, 'users', uid, 'routines', id);
const checkRef = (uid: string, date: string) => doc(db, 'users', uid, 'routineChecks', date);

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

/** Broken items (missing fields after a bad write) are dropped without crashing the group. */
function toItem(d: DocumentData): RoutineItem | null {
  if (typeof d?.id !== 'string' || typeof d?.text !== 'string') return null;
  return { id: d.id, text: d.text, days: Array.isArray(d.days) ? cleanDays(d.days) : [] };
}

function toGroup(id: string, d: DocumentData): RoutineGroup {
  const raw = Array.isArray(d.items) ? (d.items as DocumentData[]) : [];
  const items: RoutineItem[] = [];
  for (const r of raw) {
    const item = toItem(r);
    if (item) items.push(item);
  }
  return {
    id,
    title: (d.title as string) ?? '',
    order: (d.order as number) ?? 0,
    items,
    archivedAt: d.archivedAt ?? null,
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
  };
}

function toChecks(date: string, d: DocumentData | undefined): RoutineChecks {
  const checked: Record<string, number> = {};
  const raw = d?.checked;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') checked[k] = v;
  }
  return { date, checked };
}

export const EMPTY_CHECKS = (date: string): RoutineChecks => ({ date, checked: {} });

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** Groups in use, in order. Archived groups are NOT here. */
export function subscribeRoutines(
  uid: string,
  cb: (groups: RoutineGroup[]) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    query(groupCol(uid), orderBy('order', 'asc')),
    (snap) => {
      const all = snap.docs.map((d) => toGroup(d.id, d.data()));
      cb(all.filter((g) => g.archivedAt === null));
    },
    (e) => onError?.(e)
  );
}

function cleanTitle(title: string): string {
  const t = title.trim().slice(0, ROUTINE_TITLE_MAX);
  if (!t) throw new RoutineError('Give the group a name.');
  return t;
}

export async function createGroup(
  uid: string,
  title: string,
  existing: RoutineGroup[]
): Promise<string> {
  const now = Date.now();
  const created = await addDoc(groupCol(uid), {
    title: cleanTitle(title),
    order: existing.reduce((m, g) => Math.max(m, g.order), -1) + 1,
    items: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return created.id;
}

export async function renameGroup(uid: string, id: string, title: string): Promise<void> {
  await updateDoc(groupRef(uid, id), { title: cleanTitle(title), updatedAt: Date.now() });
}

/** Overwrites the whole item array. One write, no half state. */
export async function saveItems(uid: string, id: string, items: RoutineItem[]): Promise<void> {
  const clean = items
    .map((i) => ({ id: i.id, text: cleanText(i.text), days: cleanDays(i.days) }))
    .filter((i) => i.text.length > 0);
  await updateDoc(groupRef(uid, id), { items: clean, updatedAt: Date.now() });
}

/** Swaps two groups: rewrites both `order` values. */
export async function swapGroups(uid: string, a: RoutineGroup, b: RoutineGroup): Promise<void> {
  const now = Date.now();
  await Promise.all([
    updateDoc(groupRef(uid, a.id), { order: b.order, updatedAt: now }),
    updateDoc(groupRef(uid, b.id), { order: a.order, updatedAt: now }),
  ]);
}

export async function archiveGroup(uid: string, id: string): Promise<void> {
  const now = Date.now();
  await updateDoc(groupRef(uid, id), { archivedAt: now, updatedAt: now });
}

/** Undo cho `archiveGroup`. */
export async function restoreGroup(uid: string, id: string): Promise<void> {
  await updateDoc(groupRef(uid, id), { archivedAt: null, updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Ticks per day
// ---------------------------------------------------------------------------

export function subscribeChecks(
  uid: string,
  date: string,
  cb: (c: RoutineChecks) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    checkRef(uid, date),
    (snap) => cb(snap.exists() ? toChecks(date, snap.data()) : EMPTY_CHECKS(date)),
    (e) => onError?.(e)
  );
}

/**
 * Ticks / unticks one item. Merged by key, so two quick taps on two different
 * items never overwrite each other.
 */
export async function setChecked(
  uid: string,
  date: string,
  itemId: string,
  on: boolean
): Promise<void> {
  await setDoc(
    checkRef(uid, date),
    { date, checked: { [itemId]: on ? Date.now() : deleteField() }, updatedAt: Date.now() },
    { merge: true }
  );
}
