// ============================================================
// logi - Store of generated insights (Stage 7 Task 6)
// Path: users/{uid}/insights/{from_to}
//
// Why cache: reopening the same week and getting different notes makes the
// user lose trust in the whole feature. API cost is only a side reason.
//
// The id is `from_to`, so each range keeps only its latest copy, no junk.
// ============================================================

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import type { InsightResult } from '@/lib/insight-sanitize';

/** Keep the latest 20, delete older ones gradually. */
export const KEEP_INSIGHTS = 20;

export interface StoredInsight {
  id: string;
  from: string;
  to: string;
  /** Unchanged data means an unchanged hash → reuse, no API call. */
  digestHash: string;
  result: InsightResult;
  createdAt: number;
}

const col = (uid: string) => collection(db, 'users', uid, 'insights');
export const insightId = (from: string, to: string) => `${from}_${to}`;

function toInsight(id: string, d: DocumentData): StoredInsight {
  return {
    id,
    from: (d.from as string) ?? '',
    to: (d.to as string) ?? '',
    digestHash: (d.digestHash as string) ?? '',
    result: d.result as InsightResult,
    createdAt: (d.createdAt as number) ?? 0,
  };
}

export async function getInsight(
  uid: string,
  from: string,
  to: string
): Promise<StoredInsight | null> {
  const snap = await getDoc(doc(col(uid), insightId(from, to)));
  if (!snap.exists()) return null;
  const v = toInsight(snap.id, snap.data());
  return v.result ? v : null;
}

export async function saveInsight(
  uid: string,
  input: { from: string; to: string; digestHash: string; result: InsightResult },
  now: number = Date.now()
): Promise<StoredInsight> {
  const stored: StoredInsight = { id: insightId(input.from, input.to), ...input, createdAt: now };
  const { id, ...data } = stored;
  await setDoc(doc(col(uid), id), data);
  // Background cleanup: if it fails, the result the user sees is unaffected.
  void trimInsights(uid).catch(() => {});
  return stored;
}

export async function listInsights(uid: string): Promise<StoredInsight[]> {
  const snap = await getDocs(query(col(uid), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => toInsight(d.id, d.data()));
}

/** Deletes copies beyond 20. At most ~21 reads, run after each save. */
export async function trimInsights(uid: string, keep = KEEP_INSIGHTS): Promise<number> {
  const all = await listInsights(uid);
  const extra = all.slice(keep);
  await Promise.all(extra.map((i) => deleteDoc(doc(col(uid), i.id))));
  return extra.length;
}

/** Users must be able to delete what the AI wrote about them. */
export async function deleteInsight(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id));
}

export async function deleteAllInsights(uid: string): Promise<number> {
  const all = await listInsights(uid);
  await Promise.all(all.map((i) => deleteDoc(doc(col(uid), i.id))));
  return all.length;
}
