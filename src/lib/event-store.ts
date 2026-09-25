// ---------------------------------------------------------------------------
// logi - Firestore cho sự kiện sắp tới (Stage 9)
//
// Quyết định logic nằm hết ở `@/lib/events` (file thuần, test bằng node --test).
// Ở đây chỉ có đường đọc/ghi.
//
// Hai luật của tầng này:
//   - Xoá = set `archivedAt`, KHÔNG hard-delete (trừ Undo ngay sau khi tạo).
//   - Đổi ngày thì XOÁ SẠCH `notified`. Mốc cũ tính theo ngày cũ; giữ lại
//     nghĩa là dời một việc ra xa rồi không bao giờ được nhắc mốc đó nữa.
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
/** "09:05" hoặc "23:59". 24 giờ, luôn hai chữ số - dạng <input type="time"> trả về. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toEvent(id: string, d: DocumentData): EventItem {
  const raw = d.notified;
  return {
    id,
    title: (d.title as string) ?? '',
    date: (d.date as string) ?? '',
    time: (d.time as string | null) ?? null,
    note: (d.note as string | null) ?? null,
    // Doc cũ hoặc ghi hỏng → coi như chưa gửi gì. Nhắc thừa một lần còn hơn
    // để cả danh sách sập vì một field sai kiểu.
    notified: raw && typeof raw === 'object' ? (raw as Record<string, number>) : {},
    archivedAt: (d.archivedAt as number | null) ?? null,
    createdAt: (d.createdAt as number) ?? 0,
    updatedAt: (d.updatedAt as number) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

/**
 * Sự kiện chưa xoá, theo ngày tăng dần.
 *
 * Lọc `archivedAt` ngay trong query chứ không ở client: việc đã xoá tích lại
 * mãi mãi, còn việc đang chờ thì có trần 40. Chỉ cái có trần mới được stream.
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
  /** "11:30", hoặc null = cả ngày. */
  time: string | null;
  note: string | null;
}

/** Kiểm ở client cho câu báo lỗi tử tế; rules kiểm lại lần nữa ở tầng DB. */
function clean(input: EventInput): EventInput {
  const title = input.title.trim().slice(0, EVENT_TITLE_MAX);
  if (!title) throw new EventError('Give the event a name.');
  if (!DATE_RE.test(input.date)) throw new EventError('Pick a date.');
  // Ô giờ để trống trả về chuỗi rỗng, không phải null. Cả hai đều là "cả ngày".
  const time = input.time || null;
  if (time !== null && !TIME_RE.test(time)) throw new EventError('That time looks wrong.');
  const note = input.note?.trim().slice(0, EVENT_NOTE_MAX) || null;
  return { title, date: input.date, time, note };
}

/**
 * Thêm sự kiện.
 *
 * @param existing danh sách đang hiện trên màn hình, để kiểm trần.
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
 * Sửa sự kiện.
 *
 * Đổi ngày → `notified` về rỗng. Mốc "đã gửi" chỉ có nghĩa với ngày lúc gửi;
 * dời sự kiện từ còn-3-ngày sang còn-20-ngày mà giữ cờ thì mốc 3 ngày sẽ bị
 * bỏ qua khi nó đến lần nữa.
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

/** Xoá mềm. Doc ở lại để `notified` không bị gửi lại nếu người dùng khôi phục. */
export async function archiveEvent(uid: string, id: string): Promise<void> {
  const now = Date.now();
  await updateDoc(eventRef(uid, id), { archivedAt: now, updatedAt: now });
}

/** Undo cho `archiveEvent`. */
export async function restoreEvent(uid: string, id: string): Promise<void> {
  await updateDoc(eventRef(uid, id), { archivedAt: null, updatedAt: Date.now() });
}

/** Chỉ dùng cho Undo ngay sau khi tạo nhầm. Rules chặn sau 60 giây. */
export async function hardDeleteEvent(uid: string, id: string): Promise<void> {
  await deleteDoc(eventRef(uid, id));
}
