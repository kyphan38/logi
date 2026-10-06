// ---------------------------------------------------------------------------
// logi - Firestore for upcoming events (Stage 9)
//
// All decisions live in `@/lib/events` (pure, tested with node --test).
// This file only reads and writes.
//
// Two rules of this layer:
//   - Delete = set `archivedAt`, NO hard delete (except Undo right after creating).
//   - Changing the date CLEARS `notified`. Old marks were computed from the old
//     date; keeping them means moving an event further out and never getting
//     that mark again.
// ---------------------------------------------------------------------------
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import {
  EVENT_NOTE_MAX,
  EVENT_TITLE_MAX,
  MAX_EVENTS,
  type EventItem,
} from '@/types/logi';

export class EventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventError';
  }
}

const eventCol = (uid: string) => collection(db, 'users', uid, 'events');
const eventRef = (uid: string, id: string) => doc(db, 'users', uid, 'events', id);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "09:05" or "23:59". 24-hour, always two digits - what <input type="time"> returns. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toEvent(id: string, d: DocumentData): EventItem {
  const raw = d.notified;
  return {
    id,
    title: (d.title as string) ?? '',
    date: (d.date as string) ?? '',
    time: (d.time as string | null) ?? null,
    note: (d.note as string | null) ?? null,
    // An old doc or a bad write → treat as nothing sent. One extra reminder
    // beats the whole list crashing on one mistyped field.
    notified: raw && typeof raw === 'object' ? (raw as Record<string, number>) : {},
    archivedAt: (d.archivedAt as number | null) ?? null,
    createdAt: (d.createdAt as number) ?? 0,
    updatedAt: (d.updatedAt as number) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Events not deleted, by date ascending.
 *
 * `archivedAt` is filtered in the query, not on the client: deleted events pile
 * up forever, while pending ones are capped at 40. Only the capped set is streamed.
 */
export function subscribeEvents(
  uid: string,
  cb: (events: EventItem[]) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    query(eventCol(uid), where('archivedAt', '==', null), orderBy('date', 'asc')),
    (snap) => cb(snap.docs.map((d) => toEvent(d.id, d.data()))),
    (e) => onError?.(e)
  );
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export interface EventInput {
  title: string;
  date: string;
  /** "11:30", or null = all day. */
  time: string | null;
  note: string | null;
}

/** Checked on the client for a friendly error; the rules check again at the DB layer. */
function clean(input: EventInput): EventInput {
  const title = input.title.trim().slice(0, EVENT_TITLE_MAX);
  if (!title) throw new EventError('Give the event a name.');
  if (!DATE_RE.test(input.date)) throw new EventError('Pick a date.');
  // An empty time field returns an empty string, not null. Both mean "all day".
  const time = input.time || null;
  if (time !== null && !TIME_RE.test(time)) throw new EventError('That time looks wrong.');
  const note = input.note?.trim().slice(0, EVENT_NOTE_MAX) || null;
  return { title, date: input.date, time, note };
}

/**
 * Adds an event.
 *
 * @param existing the list currently on screen, to check the cap.
 */
export async function createEvent(
  uid: string,
  input: EventInput,
  existing: EventItem[]
): Promise<string> {
  if (existing.length >= MAX_EVENTS) {
    throw new EventError(`Too many events - ${MAX_EVENTS} max. Remove one first.`);
  }
  const now = Date.now();
  const created = await addDoc(eventCol(uid), {
    ...clean(input),
    notified: {},
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return created.id;
}

/**
 * Edits an event.
 *
 * Changing the date → `notified` is emptied. A "sent" mark only means
 * something for the date it was sent for; moving an event from 3 days away to
 * 20 days away while keeping the flag skips the 3-day mark when it comes again.
 */
export async function updateEvent(
  uid: string,
  current: EventItem,
  input: EventInput
): Promise<void> {
  const c = clean(input);
  await updateDoc(eventRef(uid, current.id), {
    ...c,
    ...(c.date === current.date ? {} : { notified: {} }),
    updatedAt: Date.now(),
  });
}

/** Soft delete. The doc stays so `notified` is not resent if the user restores it. */
export async function archiveEvent(uid: string, id: string): Promise<void> {
  const now = Date.now();
  await updateDoc(eventRef(uid, id), { archivedAt: now, updatedAt: now });
}

/** Undo cho `archiveEvent`. */
export async function restoreEvent(uid: string, id: string): Promise<void> {
  await updateDoc(eventRef(uid, id), { archivedAt: null, updatedAt: Date.now() });
}

/** Only for Undo right after a mistaken create. The rules block it after 60 seconds. */
export async function hardDeleteEvent(uid: string, id: string): Promise<void> {
  await deleteDoc(eventRef(uid, id));
}
