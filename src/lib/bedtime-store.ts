// ---------------------------------------------------------------------------
// logi - Firestore for dayLogs (Stage 8)
//
// `dayLogs/{logicalDate}` holds marks of the day that are NOT sessions. Only
// `bedtimeAt` for now. The doc id is the logical day, so writing twice in one
// night overwrites, never creates a second record.
//
// Bedtime does NOT go into `activities`: no target, not part of the 89h.
// ---------------------------------------------------------------------------
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import { logicalDate } from '@/lib/balance';
import type { DayLog } from '@/types/logi';

const logCol = (uid: string) => collection(db, 'users', uid, 'dayLogs');
const logRef = (uid: string, date: string) => doc(db, 'users', uid, 'dayLogs', date);

function toLog(date: string, d: DocumentData | undefined): DayLog {
  return {
    date,
    bedtimeAt: typeof d?.bedtimeAt === 'number' ? d.bedtimeAt : null,
    updatedAt: d?.updatedAt ?? 0,
  };
}

export const EMPTY_LOG = (date: string): DayLog => ({ date, bedtimeAt: null, updatedAt: 0 });

/**
 * Logs the bedtime mark.
 *
 * The logical day comes FROM `at`, not `Date.now()`. Tapping at 00:30, the
 * 04:00 cut moves it to the previous day's night - where the user expects it.
 * Editing a past time goes through this same path.
 */
export async function setBedtime(uid: string, at: number): Promise<string> {
  const date = logicalDate(at);
  await setDoc(logRef(uid, date), { date, bedtimeAt: at, updatedAt: Date.now() }, { merge: true });
  return date;
}

/** Undo: remove the mark, keep the doc. */
export async function clearBedtime(uid: string, date: string): Promise<void> {
  await setDoc(logRef(uid, date), { date, bedtimeAt: null, updatedAt: Date.now() }, { merge: true });
}

export async function getDayLog(uid: string, date: string): Promise<DayLog> {
  const snap = await getDoc(logRef(uid, date));
  return snap.exists() ? toLog(date, snap.data()) : EMPTY_LOG(date);
}

export function subscribeDayLog(
  uid: string,
  date: string,
  cb: (log: DayLog) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    logRef(uid, date),
    (snap) => cb(snap.exists() ? toLog(date, snap.data()) : EMPTY_LOG(date)),
    (e) => onError?.(e)
  );
}

/**
 * Days in [from, to] that HAVE a doc. Unlogged days are absent - the caller
 * tells "not logged" from "0" itself; never fill it in for them.
 */
export async function listDayLogs(uid: string, from: string, to: string): Promise<DayLog[]> {
  const snap = await getDocs(
    query(
      logCol(uid),
      where(documentId(), '>=', from),
      where(documentId(), '<=', to),
      orderBy(documentId())
    )
  );
  return snap.docs.map((d) => toLog(d.id, d.data()));
}
