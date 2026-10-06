// ============================================================
// logi - Activity repository
// EVERY Firestore operation on activities goes through this file.
// No component may call addDoc / updateDoc / deleteDoc directly.
// Path: users/{uid}/activities/{id}
// ============================================================

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import { logicalDate, logicalWeek, findStale } from '@/lib/balance';
import { inRange, queryPlan } from '@/lib/range';
import {
  CATEGORIES,
  MAX_SESSION_MIN,
  type Activity,
  type ActivitySource,
  type ActivityStatus,
  type Category,
} from '@/types/logi';

// ------------------------------------------------------------
// Constraint constants
// ------------------------------------------------------------

const MS_MIN = 60_000;
const MAX_SESSION_MS = MAX_SESSION_MIN * MS_MIN; // 15h
const MAX_BACKDATE_MS = 7 * 24 * 60 * MS_MIN;    // 7 days
/** Allows slight clock skew when comparing with "the future". */
const CLOCK_SKEW_MS = 60_000;

export type ActivityErrorCode =
  | 'duplicate'
  | 'end-before-start'
  | 'too-long'
  | 'too-old'
  | 'future'
  | 'bad-category'
  | 'not-found';

/** Errors with a code so the UI can tell them apart (e.g. 'duplicate' → toast, not a crash). */
export class ActivityError extends Error {
  code: ActivityErrorCode;
  constructor(code: ActivityErrorCode, message: string) {
    super(message);
    this.name = 'ActivityError';
    this.code = code;
  }
}

// ------------------------------------------------------------
// Derived fields - the ONLY function
// Every write path must go through here.
// logicalDate / logicalWeek ALWAYS come from startAt, never from endAt.
// ------------------------------------------------------------

export function derive(startAt: number, endAt: number | null) {
  return {
    logicalDate: logicalDate(startAt),
    logicalWeek: logicalWeek(startAt),
    durationMin: endAt ? Math.round((endAt - startAt) / MS_MIN) : null,
  };
}

// ------------------------------------------------------------
// Client-side validation - a clear error before the rules throw an
// unclear permission-denied.
// ------------------------------------------------------------

export function assertCategory(c: string): asserts c is Category {
  if (!(CATEGORIES as readonly string[]).includes(c)) {
    throw new ActivityError('bad-category', `Unknown category "${c}"`);
  }
}

export function validateTimes(
  startAt: number,
  endAt: number | null,
  status: ActivityStatus,
  now: number = Date.now()
): void {
  if (!Number.isFinite(startAt)) {
    throw new ActivityError('end-before-start', 'Invalid start time');
  }
  if (endAt !== null) {
    if (endAt <= startAt) {
      throw new ActivityError('end-before-start', 'End time must be after start time');
    }
    if (endAt - startAt > MAX_SESSION_MS) {
      throw new ActivityError('too-long', 'Session cannot exceed 15 hours');
    }
  }
  if (now - startAt > MAX_BACKDATE_MS) {
    throw new ActivityError('too-old', 'Cannot log more than 7 days back');
  }
  if (status !== 'scheduled' && startAt > now + CLOCK_SKEW_MS) {
    throw new ActivityError('future', 'Start time cannot be in the future');
  }
}

/**
 * With endAt = finished. Without endAt = running. THESE TWO GO TOGETHER.
 *
 * Setting endAt but forgetting status is a silent bug: History draws a
 * finished record while Now keeps counting, since it queries `status == 'active'`.
 * 'abandoned' stays - abandoned is abandoned, end time or not.
 */
export function statusForTimes(endAt: number | null, status: ActivityStatus): ActivityStatus {
  if (endAt !== null && (status === 'active' || status === 'scheduled')) return 'done';
  if (endAt === null && status === 'done') return 'active';
  return status;
}

// ------------------------------------------------------------
// Low-level read / write
// ------------------------------------------------------------

function col(uid: string) {
  return collection(db, 'users', uid, 'activities');
}

function ref(uid: string, id: string) {
  return doc(db, 'users', uid, 'activities', id);
}

function toActivity(id: string, d: DocumentData): Activity {
  return {
    id,
    category: d.category as Category,
    label: d.label ?? null,
    startAt: d.startAt as number,
    endAt: d.endAt ?? null,
    durationMin: d.durationMin ?? null,
    logicalDate: d.logicalDate as string,
    logicalWeek: d.logicalWeek as string,
    status: d.status as ActivityStatus,
    source: d.source ?? 'manual',
    confidence: d.confidence ?? null,
    rawText: d.rawText ?? null,
    createdAt: d.createdAt ?? d.startAt,
    updatedAt: d.updatedAt ?? d.startAt,
  };
}

/**
 * Defensive filter - AMENDMENT-remove-sleep section 4.2.
 *
 * 'sleep' records were deleted from Firestore, but the device's offline cache
 * may still hold some, or a record may have been waiting to sync when the
 * delete script ran. Filter on the client after the snapshot: a `where` in the
 * query would need a new index for no gain.
 */
const RETIRED_CATEGORIES: readonly string[] = ['sleep'];

function isRetired(d: DocumentData): boolean {
  return RETIRED_CATEGORIES.includes(d.category as string);
}

/** Map snapshot → Activity[], dropping every retired category. */
export function mapDocs(docs: QueryDocumentSnapshot[]): Activity[] {
  const out: Activity[] = [];
  for (const d of docs) {
    if (isRetired(d.data())) continue;
    out.push(toActivity(d.id, d.data()));
  }
  return out;
}

/**
 * Offline, read the cache directly: getDoc/getDocs wait for the network
 * timeout before falling back to cache, making offline Start/Stop slow.
 */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Reads 1 activity. Used internally when the current startAt/endAt are needed to re-derive. */
export async function getActivity(uid: string, id: string): Promise<Activity> {
  const r = ref(uid, id);
  const snap = isOffline() ? await getDocFromCache(r) : await getDoc(r);
  if (!snap.exists()) throw new ActivityError('not-found', 'Activity not found');
  return toActivity(snap.id, snap.data());
}

// ------------------------------------------------------------
// Ghi
// ------------------------------------------------------------

/**
 * Where a record came from. Voice saves it for checking when Gemini parses
 * wrong: `rawText` keeps the sentence, `confidence` says how sure the parser was.
 */
export interface Provenance {
  source?: ActivitySource;
  confidence?: number | null;
  rawText?: string | null;
}

export interface StartInput extends Provenance {
  category: Category;
  label?: string | null;
  startAt?: number;
  /** 'scheduled' = booked ahead (delayed start). Default is 'active'. */
  status?: Extract<ActivityStatus, 'active' | 'scheduled'>;
}

/**
 * Creates a running session, or books one ahead with `status: 'scheduled'`.
 * Blocks duplicates: an `active` session in the same category → throw 'duplicate'.
 * Does NOT auto-stop other sessions - running in parallel is valid.
 */
export async function startActivity(uid: string, input: StartInput): Promise<string> {
  assertCategory(input.category);
  const now = Date.now();
  const startAt = input.startAt ?? now;
  const status = input.status ?? 'active';
  validateTimes(startAt, null, status, now);

  // Only running sessions can duplicate. Scheduled ones cannot.
  if (status === 'active') {
    const running = await listActive(uid);
    if (running.some((a) => a.category === input.category)) {
      throw new ActivityError('duplicate', `Already tracking ${input.category}`);
    }
  }

  const created = await addDoc(col(uid), {
    category: input.category,
    label: input.label ?? null,
    startAt,
    endAt: null,
    ...derive(startAt, null),
    status,
    source: input.source ?? 'manual',
    confidence: input.confidence ?? null,
    rawText: input.rawText ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return created.id;
}

/** Stops a session. endAt defaults to now. */
export async function stopActivity(uid: string, id: string, endAt?: number): Promise<void> {
  const current = await getActivity(uid, id);
  const end = endAt ?? Date.now();
  validateTimes(current.startAt, end, 'done');

  await updateDoc(ref(uid, id), {
    endAt: end,
    status: 'done' satisfies ActivityStatus,
    ...derive(current.startAt, end),
    updatedAt: Date.now(),
  });
}

/**
 * Edits an activity.
 * ALWAYS reruns derive() when the patch touches startAt / endAt - forgetting is
 * a silent bug: the record still shows in History but vanishes from weekly stats.
 */
export async function updateActivity(
  uid: string,
  id: string,
  patch: Partial<Omit<Activity, 'id'>>
): Promise<void> {
  const current = await getActivity(uid, id);

  const next: Record<string, unknown> = {};
  if (patch.category !== undefined) {
    assertCategory(patch.category);
    next.category = patch.category;
  }
  if (patch.label !== undefined) next.label = patch.label ?? null;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.source !== undefined) next.source = patch.source;
  if (patch.confidence !== undefined) next.confidence = patch.confidence ?? null;
  if (patch.rawText !== undefined) next.rawText = patch.rawText ?? null;

  const touchesTime = patch.startAt !== undefined || patch.endAt !== undefined;
  if (touchesTime) {
    const startAt = patch.startAt ?? current.startAt;
    const endAt = patch.endAt !== undefined ? patch.endAt : current.endAt;
    // When times change, status must follow. Callers need not remember this rule.
    const status = statusForTimes(endAt, (patch.status ?? current.status) as ActivityStatus);
    validateTimes(startAt, endAt, status);

    next.status = status;
    next.startAt = startAt;
    next.endAt = endAt;
    Object.assign(next, derive(startAt, endAt));
  }

  next.updatedAt = Date.now();
  await updateDoc(ref(uid, id), next);
}

export async function deleteActivity(uid: string, id: string): Promise<void> {
  await deleteDoc(ref(uid, id));
}

export interface PastInput extends Provenance {
  category: Category;
  label?: string | null;
  startAt: number;
  endAt: number;
  /** For Undo: rebuild the just-deleted record exactly. */
  status?: ActivityStatus;
}

/** Adds a finished record (manual entry, or Undo after a delete). */
export async function createPastActivity(uid: string, input: PastInput): Promise<string> {
  assertCategory(input.category);
  const status = input.status ?? 'done';
  validateTimes(input.startAt, input.endAt, status);

  const now = Date.now();
  const created = await addDoc(col(uid), {
    category: input.category,
    label: input.label ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    ...derive(input.startAt, input.endAt),
    status,
    source: input.source ?? 'manual',
    confidence: input.confidence ?? null,
    rawText: input.rawText ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return created.id;
}

// ------------------------------------------------------------
// Realtime reads
// ------------------------------------------------------------

export interface SnapMeta {
  hasPendingWrites: boolean;
  fromCache: boolean;
  /** Ids of records still in the write queue - for the pending dot on cards. */
  pendingIds: ReadonlySet<string>;
}

export const NO_PENDING: ReadonlySet<string> = new Set<string>();

function metaOf(snap: {
  metadata: { hasPendingWrites: boolean; fromCache: boolean };
  docs: { id: string; metadata: { hasPendingWrites: boolean } }[];
}): SnapMeta {
  return {
    hasPendingWrites: snap.metadata.hasPendingWrites,
    fromCache: snap.metadata.fromCache,
    pendingIds: new Set(snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)),
  };
}

const byStartAsc = (a: Activity, b: Activity) => a.startAt - b.startAt;

/**
 * Running sessions. No orderBy, so a single-field index is enough;
 * sorted on the client (always a tiny count).
 */
export function subscribeActive(
  uid: string,
  cb: (activities: Activity[], meta: SnapMeta) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(col(uid), where('status', '==', 'active'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const list = mapDocs(snap.docs).sort(byStartAsc);
      cb(onlyRunning(uid, list), metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * Every activity of one logical day ("2026-08-26").
 *
 * Queries exactly ONE day. It used to fetch the day before too, to draw
 * "Asleep until 7:30 AM"; with Sleep gone nobody needs it
 * (AMENDMENT-remove-sleep sections 6 + 9).
 *
 * A session crossing midnight (e.g. Leisure 22:00 -> 01:00) belongs to the
 * logical day of `startAt`, and is drawn whole on that day - not cut.
 */
export function subscribeByDate(
  uid: string,
  date: string,
  cb: (activities: Activity[], meta: SnapMeta) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(col(uid), where('logicalDate', '==', date), orderBy('startAt', 'asc'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      cb(mapDocs(snap.docs), metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * Listens to a whole logical week. For the balance banner.
 * The `logicalWeek ASC + startAt ASC` index exists since Stage 1.
 */
export function subscribeByWeek(
  uid: string,
  week: string,
  cb: (activities: Activity[], meta: SnapMeta) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(col(uid), where('logicalWeek', '==', week), orderBy('startAt', 'asc'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      // Drop 'scheduled' records: a plan, not hours lived.
      const list = mapDocs(snap.docs)
        .filter((a) => a.status !== 'scheduled');
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * Listens to a whole RANGE for Analytics (Stage 5).
 *
 * ONE query for the whole range - never per day. `queryPlan()` picks the
 * cheaper way:
 *   ≤ 4 weeks → `logicalWeek in [...]`, sharing cache with History/Now
 *   longer    → a range on `logicalDate` (index `logicalDate ASC + startAt ASC`)
 *
 * Week queries over-fetch at both ends, so `inRange()` filters again.
 */
export function subscribeByRange(
  uid: string,
  range: { from: string; to: string },
  cb: (activities: Activity[], meta: SnapMeta) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const plan = queryPlan(range);
  const q =
    plan.mode === 'weeks'
      ? query(col(uid), where('logicalWeek', 'in', plan.weeks), orderBy('startAt', 'asc'))
      : query(
          col(uid),
          where('logicalDate', '>=', plan.from),
          where('logicalDate', '<=', plan.to),
          orderBy('logicalDate', 'asc'),
          orderBy('startAt', 'asc')
        );

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const list = mapDocs(snap.docs)
        // 'scheduled' is a plan, not hours lived → not in the chart.
        .filter((a) => a.status !== 'scheduled' && inRange(a.logicalDate, range))
        .sort(byStartAsc);
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * One-time read of a whole range (Stage 7): AI insight needs the PREVIOUS
 * period to compare, and that period never changes, so no extra listener.
 * Reuses `subscribeByRange`'s exact `queryPlan()`.
 */
export async function listByRange(
  uid: string,
  range: { from: string; to: string }
): Promise<Activity[]> {
  const plan = queryPlan(range);
  const q =
    plan.mode === 'weeks'
      ? query(col(uid), where('logicalWeek', 'in', plan.weeks), orderBy('startAt', 'asc'))
      : query(
          col(uid),
          where('logicalDate', '>=', plan.from),
          where('logicalDate', '<=', plan.to),
          orderBy('logicalDate', 'asc'),
          orderBy('startAt', 'asc')
        );

  const snap = await getDocs(q);
  return mapDocs(snap.docs)
    .filter((a) => a.status !== 'scheduled' && inRange(a.logicalDate, range))
    .sort(byStartAsc);
}

/** One-time read of running sessions. */
export async function listActive(uid: string): Promise<Activity[]> {
  const q = query(col(uid), where('status', '==', 'active'));
  const snap = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
  return onlyRunning(uid, mapDocs(snap.docs).sort(byStartAsc));
}

/**
 * Running = no endAt. An `active` record with an endAt is broken data (the old
 * voice edit path set endAt but forgot status) - filter it out of Now, then
 * fix it in Firestore. Once written it leaves the query, so no loop.
 */
function onlyRunning(uid: string, list: Activity[]): Activity[] {
  const running = list.filter((a) => a.endAt === null);
  if (running.length === list.length) return list;

  for (const a of list) {
    if (a.endAt === null) continue;
    void updateDoc(ref(uid, a.id), {
      status: 'done' satisfies ActivityStatus,
      ...derive(a.startAt, a.endAt),
      updatedAt: Date.now(),
    }).catch(() => {});
  }
  return running;
}

/** An active session over 15h → ask for the end time again. Never auto-deleted. */
export async function listStale(uid: string): Promise<Activity[]> {
  return findStale(await listActive(uid));
}

/**
 * The last N records - context for the Gemini prompt.
 * Skips 'scheduled' (not happened) and 'abandoned' (junk that misleads the model).
 * Index: status ASC + startAt DESC.
 */
export async function listRecent(uid: string, n = 5): Promise<Activity[]> {
  const q = query(
    col(uid),
    where('status', 'in', ['done', 'active'] satisfies ActivityStatus[]),
    orderBy('startAt', 'desc'),
    fsLimit(n)
  );
  const snap = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
  return mapDocs(snap.docs);
}

/**
 * Booked but never happened. Past this age, count it as dropped.
 * Seven days: long enough for a booking next week to stay intact, short
 * enough not to pile into a junk list.
 */
export const SCHEDULED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A `scheduled` record past due - just the comparison, separate so it can be tested. */
export function isStaleScheduled(a: Activity, now: number = Date.now()): boolean {
  return a.status === 'scheduled' && now - a.startAt > SCHEDULED_MAX_AGE_MS;
}

/**
 * Cleans up bookings that never happened: 'scheduled' → 'abandoned'.
 *
 * MUST run before `promoteScheduled`. Without it, a booking from ten days ago
 * would be promoted to 'active' with an ancient startAt, then show as a
 * session running for 240 hours.
 *
 * No delete: the record stays for review, it just does not count as hours.
 */
export async function abandonStaleScheduled(uid: string, now: number = Date.now()): Promise<number> {
  const q = query(
    col(uid),
    where('status', '==', 'scheduled' satisfies ActivityStatus),
    where('startAt', '<=', now - SCHEDULED_MAX_AGE_MS),
    orderBy('startAt', 'asc')
  );
  const snap = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
  for (const d of snap.docs) {
    await updateDoc(ref(uid, d.id), {
      status: 'abandoned' satisfies ActivityStatus,
      updatedAt: Date.now(),
    });
  }
  return snap.docs.length;
}

/**
 * Delayed start: when the time comes, 'scheduled' → 'active'. Returns how many moved.
 * startAt is kept (the booked time), so the timer stays correct derived state.
 *
 * Deliberately does NOT block same-category duplicates like startActivity: the
 * app allows parallel sessions, and a booked record must start on time, not be
 * silently skipped. If two sessions share a category, the user stops one.
 *
 * Index: status ASC + startAt ASC.
 */
export async function promoteScheduled(uid: string, now: number = Date.now()): Promise<number> {
  const q = query(
    col(uid),
    where('status', '==', 'scheduled' satisfies ActivityStatus),
    where('startAt', '<=', now),
    orderBy('startAt', 'asc')
  );
  const snap = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
  for (const d of snap.docs) {
    if (isRetired(d.data())) continue;
    const a = toActivity(d.id, d.data());
    await updateDoc(ref(uid, a.id), {
      status: 'active' satisfies ActivityStatus,
      ...derive(a.startAt, null),
      updatedAt: Date.now(),
    });
  }
  return snap.docs.length;
}

/** Booked sessions not yet started - for the "starts in 4:32" countdown. */
export function subscribeScheduled(
  uid: string,
  cb: (activities: Activity[], meta: SnapMeta) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(
    col(uid),
    where('status', '==', 'scheduled' satisfies ActivityStatus),
    orderBy('startAt', 'asc')
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const list = mapDocs(snap.docs);
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/** Recent logical days with data - for the small dots under the day picker. */
export function subscribeRecentDates(
  uid: string,
  sinceDate: string,
  cb: (dates: Set<string>) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(col(uid), where('logicalDate', '>=', sinceDate));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        new Set(
          snap.docs
            .filter((d) => !isRetired(d.data()))
            .map((d) => d.data().logicalDate as string)
        )
      ),
    (e) => onError?.(e)
  );
}

// ------------------------------------------------------------
// Backup & restore (Stage 6 Task 3)
// ------------------------------------------------------------

/**
 * Every record, for the "All time" export.
 *
 * One read, no listener. Costs exactly N reads - after a year about 2–3
 * thousand, still under the free tier's 50k/day, and export is monthly.
 */
export async function listAll(uid: string): Promise<Activity[]> {
  const q = query(col(uid), orderBy('startAt', 'asc'));
  const snap = await getDocs(q);
  return mapDocs(snap.docs);
}

/** The oldest record - to know how long data has been collected. Reads exactly 1 doc. */
export async function firstActivityDate(uid: string): Promise<string | null> {
  const q = query(col(uid), orderBy('startAt', 'asc'), fsLimit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : (snap.docs[0].data().logicalDate as string);
}

/** Ids only, to know which records exist before restoring. */
export async function listAllIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(query(col(uid)));
  return new Set(snap.docs.map((d) => d.id));
}

/** Firestore allows up to 500 operations per batch; leave a safety margin. */
const BATCH_SIZE = 400;

/**
 * Writes the records from a backup file. ADD ONLY.
 *
 * Reads existing ids RIGHT BEFORE writing and filters again, even though the
 * caller already did: minutes may pass between the preview and the tap, and
 * every second is a chance to overwrite a new record with an older copy.
 */
export async function restoreActivities(uid: string, add: Activity[]): Promise<number> {
  if (add.length === 0) return 0;

  const existing = await listAllIds(uid);
  const todo = add.filter((a) => !existing.has(a.id));
  let written = 0;

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const a of todo.slice(i, i + BATCH_SIZE)) {
      batch.set(ref(uid, a.id), restoreDoc(a));
    }
    await batch.commit();
    written += Math.min(BATCH_SIZE, todo.length - i);
  }
  return written;
}

/**
 * Rebuilds a doc from a file record.
 *
 * Recomputes derived fields instead of trusting the file: it may come from an
 * older app version, or be edited by hand. `startAt` is the ground truth, the
 * rest is derived.
 */
function restoreDoc(a: Activity) {
  const endAt = a.endAt ?? null;
  return {
    category: a.category,
    label: a.label ?? null,
    startAt: a.startAt,
    endAt,
    ...derive(a.startAt, endAt),
    status: a.status,
    source: a.source ?? 'manual',
    confidence: a.confidence ?? null,
    rawText: a.rawText ?? null,
    createdAt: a.createdAt ?? a.startAt,
    updatedAt: Date.now(),
  };
}
