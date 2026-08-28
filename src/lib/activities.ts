// ============================================================
// logi — Activity repository
// MỌI thao tác Firestore với activity đi qua file này.
// Không component nào được gọi thẳng addDoc / updateDoc / deleteDoc.
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
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import { logicalDate, logicalWeek, findStale } from '@/lib/balance';
import { inRange, queryPlan } from '@/lib/range';
import { addDays, dayWindow } from '@/lib/timeline';
import {
  CATEGORIES,
  MAX_SESSION_MIN,
  type Activity,
  type ActivitySource,
  type ActivityStatus,
  type Category,
} from '@/types/logi';

// ------------------------------------------------------------
// Hằng số ràng buộc
// ------------------------------------------------------------

const MS_MIN = 60_000;
const MAX_SESSION_MS = MAX_SESSION_MIN * MS_MIN; // 15h
const MAX_BACKDATE_MS = 7 * 24 * 60 * MS_MIN;    // 7 ngày
/** Cho phép lệch đồng hồ nhẹ khi so với "tương lai". */
const CLOCK_SKEW_MS = 60_000;

export type ActivityErrorCode =
  | 'duplicate'
  | 'end-before-start'
  | 'too-long'
  | 'too-old'
  | 'future'
  | 'bad-category'
  | 'not-found';

/** Lỗi có mã để UI phân biệt (VD 'duplicate' → toast, không phải crash). */
export class ActivityError extends Error {
  code: ActivityErrorCode;
  constructor(code: ActivityErrorCode, message: string) {
    super(message);
    this.name = 'ActivityError';
    this.code = code;
  }
}

// ------------------------------------------------------------
// Field dẫn xuất — HÀM DUY NHẤT
// Mọi đường ghi bắt buộc đi qua đây.
// logicalDate / logicalWeek LUÔN tính từ startAt, không bao giờ từ endAt.
// ------------------------------------------------------------

export function derive(startAt: number, endAt: number | null) {
  return {
    logicalDate: logicalDate(startAt),
    logicalWeek: logicalWeek(startAt),
    durationMin: endAt ? Math.round((endAt - startAt) / MS_MIN) : null,
  };
}

// ------------------------------------------------------------
// Validation phía client — báo lỗi dễ hiểu trước khi rules ném
// permission-denied khó hiểu.
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

// ------------------------------------------------------------
// Đọc / ghi thấp tầng
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
 * Mất mạng thì đọc thẳng cache: getDoc/getDocs phải chờ hết timeout mạng
 * trước khi tự rơi về cache, làm Start/Stop offline chậm hẳn.
 */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Đọc 1 activity. Dùng nội bộ khi cần startAt/endAt hiện tại để re-derive. */
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
 * Nguồn gốc record. Voice ghi kèm để sau còn tra lại khi Gemini parse sai:
 * `rawText` giữ nguyên câu nói, `confidence` cho biết máy tự tin tới đâu.
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
  /** 'scheduled' = hẹn giờ trước (delayed start). Mặc định là 'active'. */
  status?: Extract<ActivityStatus, 'active' | 'scheduled'>;
}

/**
 * Tạo session đang chạy, hoặc hẹn giờ trước với `status: 'scheduled'`.
 * Chặn tạo trùng: đã có session `active` cùng category → throw 'duplicate'.
 * KHÔNG auto-stop session khác — chạy song song là hợp lệ.
 */
export async function startActivity(uid: string, input: StartInput): Promise<string> {
  assertCategory(input.category);
  const now = Date.now();
  const startAt = input.startAt ?? now;
  const status = input.status ?? 'active';
  validateTimes(startAt, null, status, now);

  // Chỉ session đang chạy mới sợ trùng. Hẹn giờ trước thì không.
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

/** Dừng session. endAt mặc định là bây giờ. */
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
 * Sửa activity.
 * LUÔN chạy lại derive() khi patch đụng tới startAt / endAt — quên bước này là
 * lỗi âm thầm: record vẫn hiện ở History nhưng biến mất khỏi thống kê tuần.
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
    const status = (patch.status ?? current.status) as ActivityStatus;
    validateTimes(startAt, endAt, status);

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
  /** Cho Undo: dựng lại record vừa xoá y nguyên. */
  status?: ActivityStatus;
}

/** Thêm record đã kết thúc (nhập tay, hoặc Undo sau khi xoá). */
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
// Đọc realtime
// ------------------------------------------------------------

export interface SnapMeta {
  hasPendingWrites: boolean;
  fromCache: boolean;
  /** Id của các record còn nằm trong hàng đợi ghi — để chấm pending trên card. */
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
 * Session đang chạy. Không orderBy để chỉ cần single-field index;
 * sắp xếp ở client (số lượng luôn rất nhỏ).
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
      const list = snap.docs.map((d) => toActivity(d.id, d.data())).sort(byStartAsc);
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * Mọi activity của một ngày logic ("2026-08-26").
 *
 * Tham số thứ ba của cb là `carriedIn`: record thuộc ngày logic liền trước
 * nhưng còn kéo dài qua mốc 04:00 (VD ngủ 22:00 → 06:00). Chúng chỉ dùng để
 * vẽ timeline cho liền mạch — KHÔNG cộng vào tổng của ngày này, vì mọi
 * analytics đều tính theo `logicalDate`.
 */
export function subscribeByDate(
  uid: string,
  date: string,
  cb: (activities: Activity[], meta: SnapMeta, carriedIn: Activity[]) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const winStart = dayWindow(date).start;
  const q = query(
    col(uid),
    where('logicalDate', 'in', [addDays(date, -1), date]),
    orderBy('startAt', 'asc')
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const own: Activity[] = [];
      const carriedIn: Activity[] = [];
      const now = Date.now();
      for (const d of snap.docs) {
        const a = toActivity(d.id, d.data());
        if (a.logicalDate === date) own.push(a);
        else if ((a.endAt ?? now) > winStart) carriedIn.push(a);
      }
      cb(own, metaOf(snap), carriedIn);
    },
    (e) => onError?.(e)
  );
}

/**
 * Nghe cả một tuần logic. Dùng cho balance banner.
 * Index `logicalWeek ASC + startAt ASC` đã có từ Stage 1.
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
      // Bỏ record 'scheduled': đó là dự định, chưa phải giờ đã sống.
      const list = snap.docs
        .map((d) => toActivity(d.id, d.data()))
        .filter((a) => a.status !== 'scheduled');
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * Nghe cả một KHOẢNG cho Analytics (Stage 5).
 *
 * MỘT query cho cả khoảng — không bao giờ query từng ngày. `queryPlan()` chọn
 * cách rẻ hơn:
 *   ≤ 4 tuần → `logicalWeek in [...]`, trùng cache với History/Now
 *   dài hơn  → range trên `logicalDate` (index `logicalDate ASC + startAt ASC`)
 *
 * Query theo tuần lấy dư ở hai đầu nên phải lọc lại bằng `inRange()`.
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
      const list = snap.docs
        .map((d) => toActivity(d.id, d.data()))
        // 'scheduled' là dự định, chưa phải giờ đã sống → không vào chart.
        .filter((a) => a.status !== 'scheduled' && inRange(a.logicalDate, range))
        .sort(byStartAsc);
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/**
 * Đọc một lần cả một khoảng (Stage 7): AI insight cần kỳ TRƯỚC để so sánh,
 * mà kỳ trước thì không đổi nữa nên không đáng mở thêm listener.
 * Dùng lại đúng `queryPlan()` của `subscribeByRange`.
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
  return snap.docs
    .map((d) => toActivity(d.id, d.data()))
    .filter((a) => a.status !== 'scheduled' && inRange(a.logicalDate, range))
    .sort(byStartAsc);
}

/** Đọc một lần các session đang chạy. */
export async function listActive(uid: string): Promise<Activity[]> {
  const q = query(col(uid), where('status', '==', 'active'));
  const snap = isOffline() ? await getDocsFromCache(q) : await getDocs(q);
  return snap.docs.map((d) => toActivity(d.id, d.data())).sort(byStartAsc);
}

/** Session active quá 15h → cần hỏi lại giờ kết thúc. KHÔNG tự xoá. */
export async function listStale(uid: string): Promise<Activity[]> {
  return findStale(await listActive(uid));
}

/**
 * N record gần nhất — dùng làm context cho prompt Gemini.
 * Bỏ qua 'scheduled' (chưa xảy ra) và 'abandoned' (rác, dễ làm model đoán sai).
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
  return snap.docs.map((d) => toActivity(d.id, d.data()));
}

/**
 * Hẹn giờ rồi không bao giờ xảy ra. Quá hạn này thì coi như đã bỏ.
 * Bảy ngày: đủ dài để một buổi hẹn tuần sau vẫn còn nguyên, đủ ngắn để
 * không tích thành một danh sách rác.
 */
export const SCHEDULED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** `scheduled` mà đã quá hạn — chỉ là phép so sánh, tách ra để test được. */
export function isStaleScheduled(a: Activity, now: number = Date.now()): boolean {
  return a.status === 'scheduled' && now - a.startAt > SCHEDULED_MAX_AGE_MS;
}

/**
 * Dọn các buổi đã hẹn nhưng không bao giờ diễn ra: 'scheduled' → 'abandoned'.
 *
 * PHẢI chạy trước `promoteScheduled`. Không có nó, một buổi hẹn từ mười ngày
 * trước sẽ được promote thành 'active' với startAt cũ mèm, rồi hiện ra như một
 * session đang chạy 240 tiếng.
 *
 * Không xoá: record vẫn còn đó để xem lại, chỉ là không tính vào giờ.
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
 * Delayed start: tới giờ thì 'scheduled' → 'active'. Trả về số record đã chuyển.
 * startAt giữ nguyên (giờ đã hẹn), nên timer vẫn là derived state đúng.
 *
 * Cố ý KHÔNG chặn trùng category như startActivity: app cho phép nhiều session
 * chạy song song, và một record đã hẹn giờ thì phải tới đúng giờ, không im lặng
 * bỏ qua. Nếu thành hai session cùng category, người dùng tự Stop bớt.
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
    const a = toActivity(d.id, d.data());
    await updateDoc(ref(uid, a.id), {
      status: 'active' satisfies ActivityStatus,
      ...derive(a.startAt, null),
      updatedAt: Date.now(),
    });
  }
  return snap.docs.length;
}

/** Các session đã hẹn giờ, chưa tới lúc chạy — để hiện đếm ngược "starts in 4:32". */
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
      const list = snap.docs.map((d) => toActivity(d.id, d.data()));
      cb(list, metaOf(snap));
    },
    (e) => onError?.(e)
  );
}

/** Các ngày logic gần đây có dữ liệu — để chấm nhỏ dưới dải chọn ngày. */
export function subscribeRecentDates(
  uid: string,
  sinceDate: string,
  cb: (dates: Set<string>) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(col(uid), where('logicalDate', '>=', sinceDate));
  return onSnapshot(
    q,
    (snap) => cb(new Set(snap.docs.map((d) => d.data().logicalDate as string))),
    (e) => onError?.(e)
  );
}

// ------------------------------------------------------------
// Backup & khôi phục (Stage 6 Task 3)
// ------------------------------------------------------------

/**
 * Toàn bộ record, cho bản export "All time".
 *
 * Đọc một lần, không listener. Tốn đúng N read — sau một năm khoảng 2–3 nghìn,
 * vẫn dưới hạn 50k/ngày của free tier, và người dùng chỉ bấm export mỗi tháng.
 */
export async function listAll(uid: string): Promise<Activity[]> {
  const q = query(col(uid), orderBy('startAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toActivity(d.id, d.data()));
}

/** Record cũ nhất — để biết dữ liệu đã tích được bao lâu. Đọc đúng 1 doc. */
export async function firstActivityDate(uid: string): Promise<string | null> {
  const q = query(col(uid), orderBy('startAt', 'asc'), fsLimit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : (snap.docs[0].data().logicalDate as string);
}

/** Chỉ id, để biết record nào đã có trước khi khôi phục. */
export async function listAllIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(query(col(uid)));
  return new Set(snap.docs.map((d) => d.id));
}

/** Firestore cho tối đa 500 thao tác một batch; chừa chỗ cho an toàn. */
const BATCH_SIZE = 400;

/**
 * Ghi lại các record trong file backup. CHỈ THÊM.
 *
 * Đọc id đang có NGAY TRƯỚC khi ghi rồi lọc lại lần nữa, dù nơi gọi đã lọc:
 * giữa lúc xem preview và lúc bấm nút có thể đã trôi qua vài phút, và mỗi giây
 * đó là một cơ hội ghi đè record mới bằng bản cũ hơn.
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
 * Dựng lại doc từ record trong file.
 *
 * Tự tính lại field dẫn xuất thay vì tin file: file có thể do bản app cũ xuất
 * ra, hoặc bị người ta sửa tay. `startAt` là sự thật gốc, phần còn lại suy ra.
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
