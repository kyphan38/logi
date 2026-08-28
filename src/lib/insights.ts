// ============================================================
// logi — Kho insight đã sinh (Stage 7 Task 6)
// Path: users/{uid}/insights/{from_to}
//
// Vì sao cache: mở lại cùng một tuần mà nhận về nhận xét khác nhau thì người
// dùng mất tin tưởng vào cả tính năng. Tiền API chỉ là lý do phụ.
//
// Id là `from_to` nên mỗi khoảng chỉ có một bản mới nhất, không sinh rác.
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

/** Giữ 20 bản gần nhất, cũ hơn thì xoá dần. */
export const KEEP_INSIGHTS = 20;

export interface StoredInsight {
  id: string;
  from: string;
  to: string;
  /** Dữ liệu không đổi thì hash không đổi → dùng lại, không gọi API. */
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
  // Dọn nền: hỏng thì cũng không ảnh hưởng kết quả người dùng đang xem.
  void trimInsights(uid).catch(() => {});
  return stored;
}

export async function listInsights(uid: string): Promise<StoredInsight[]> {
  const snap = await getDocs(query(col(uid), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => toInsight(d.id, d.data()));
}

/** Xoá phần thừa quá 20 bản. Tối đa ~21 read, chạy sau mỗi lần lưu. */
export async function trimInsights(uid: string, keep = KEEP_INSIGHTS): Promise<number> {
  const all = await listInsights(uid);
  const extra = all.slice(keep);
  await Promise.all(extra.map((i) => deleteDoc(doc(col(uid), i.id))));
  return extra.length;
}

/** Người dùng phải xoá được thứ AI đã viết về mình. */
export async function deleteInsight(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id));
}

export async function deleteAllInsights(uid: string): Promise<number> {
  const all = await listInsights(uid);
  await Promise.all(all.map((i) => deleteDoc(doc(col(uid), i.id))));
  return all.length;
}
