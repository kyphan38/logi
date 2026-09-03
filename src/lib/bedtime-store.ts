// ---------------------------------------------------------------------------
// logi - Firestore cho dayLogs (Stage 8)
//
// `dayLogs/{logicalDate}` giữ những mốc trong ngày KHÔNG phải session. Hiện chỉ
// có `bedtimeAt`. Doc id là ngày logic, nên ghi lại lần hai trong cùng đêm là
// ghi đè, không tạo bản ghi mới.
//
// Bedtime KHÔNG đi vào `activities`: không target, không nằm trong 89h.
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
 * Ghi mốc đi ngủ.
 *
 * Ngày logic được tính TỪ `at`, không phải từ `Date.now()`. Bấm lúc 00:30 thì
 * mốc cắt 04:00 đẩy nó về đêm của ngày hôm trước - đúng chỗ người dùng nghĩ.
 * Sửa lại giờ trong quá khứ cũng đi qua đúng đường này.
 */
export async function setBedtime(uid: string, at: number): Promise<string> {
  const date = logicalDate(at);
  await setDoc(logRef(uid, date), { date, bedtimeAt: at, updatedAt: Date.now() }, { merge: true });
  return date;
}

/** Undo: gỡ mốc, giữ doc lại. */
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
 * Các ngày trong khoảng [from, to] CÓ doc. Ngày chưa ghi thì vắng mặt - người
 * gọi tự phân biệt "chưa ghi" với "0", đừng điền hộ.
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
