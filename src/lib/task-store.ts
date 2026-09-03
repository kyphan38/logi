// ---------------------------------------------------------------------------
// logi - Firestore cho pool task và kế hoạch tuần (Stage 8)
//
// Quyết định logic nằm hết ở `@/lib/tasks` (file thuần, test bằng node --test).
// Ở đây chỉ có đường đọc/ghi.
//
// Hai luật của tầng này:
//   - Xoá task = set `archivedAt`, KHÔNG hard-delete. Tuần cũ vẫn phải hiện
//     được nó (quyết định 14).
//   - Kế hoạch tuần là MỘT doc chứa `cells` đã chụp sẵn. Không bao giờ đọc
//     thời lượng từ pool khi hiển thị tuần cũ.
// ---------------------------------------------------------------------------
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import {
  MAX_POOL_TASKS,
  MAX_TASKS_PER_DAY,
  TASK_MAX_DURATION,
  TASK_MIN_DURATION,
  TASK_TITLE_MAX,
  type Category,
  type PlannedCell,
  type PoolTask,
  type WeekPlan,
} from '@/types/logi';

export class TaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskError';
  }
}

const poolCol = (uid: string) => collection(db, 'users', uid, 'taskPool');
const poolRef = (uid: string, id: string) => doc(db, 'users', uid, 'taskPool', id);
const planRef = (uid: string, week: string) => doc(db, 'users', uid, 'weekPlans', week);
const planCol = (uid: string) => collection(db, 'users', uid, 'weekPlans');

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function toTask(id: string, d: DocumentData): PoolTask {
  return {
    id,
    title: (d.title as string) ?? '',
    durationMin: (d.durationMin as number) ?? 0,
    category: d.category as Category,
    order: (d.order as number) ?? 0,
    archivedAt: d.archivedAt ?? null,
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
  };
}

/** Ô hỏng (thiếu field sau một lần ghi lỗi) bị bỏ, không làm sập cả tuần. */
function toCell(d: DocumentData): PlannedCell | null {
  if (typeof d?.taskId !== 'string' || typeof d?.dow !== 'number') return null;
  return {
    taskId: d.taskId,
    dow: d.dow,
    title: (d.title as string) ?? '',
    durationMin: (d.durationMin as number) ?? 0,
    category: d.category as Category,
  };
}

function toPlan(week: string, d: DocumentData | undefined): WeekPlan {
  const raw = Array.isArray(d?.cells) ? (d.cells as DocumentData[]) : [];
  const cells: PlannedCell[] = [];
  for (const c of raw) {
    const cell = toCell(c);
    if (cell) cells.push(cell);
  }
  return { week, cells, updatedAt: d?.updatedAt ?? 0 };
}

export const EMPTY_PLAN = (week: string): WeekPlan => ({ week, cells: [], updatedAt: 0 });

// ---------------------------------------------------------------------------
// Pool - đọc
// ---------------------------------------------------------------------------

/** Task còn dùng được, theo thứ tự hàng. Task đã archive KHÔNG nằm ở đây. */
export function subscribePool(
  uid: string,
  cb: (tasks: PoolTask[]) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    query(poolCol(uid), orderBy('order', 'asc')),
    (snap) => {
      const all = snap.docs.map((d) => toTask(d.id, d.data()));
      cb(all.filter((t) => t.archivedAt === null));
    },
    (e) => onError?.(e)
  );
}

/** Cả pool, kể cả task đã archive. Dùng khi cần tra tên cho tuần cũ. */
export async function listAllTasks(uid: string): Promise<PoolTask[]> {
  const snap = await getDocs(query(poolCol(uid), orderBy('order', 'asc')));
  return snap.docs.map((d) => toTask(d.id, d.data()));
}

// ---------------------------------------------------------------------------
// Pool - ghi
// ---------------------------------------------------------------------------

export interface TaskInput {
  title: string;
  durationMin: number;
  category: Category;
}

/** Kiểm ở client cho câu báo lỗi tử tế; rules kiểm lại lần nữa ở tầng DB. */
function clean(input: TaskInput): TaskInput {
  const title = input.title.trim().slice(0, TASK_TITLE_MAX);
  if (!title) throw new TaskError('Give the task a name.');
  const durationMin = Math.round(input.durationMin);
  if (!Number.isFinite(durationMin) || durationMin < TASK_MIN_DURATION) {
    throw new TaskError(`At least ${TASK_MIN_DURATION} minutes.`);
  }
  if (durationMin > TASK_MAX_DURATION) {
    throw new TaskError(`At most ${TASK_MAX_DURATION / 60} hours.`);
  }
  return { title, durationMin, category: input.category };
}

/**
 * Thêm task. Pool đầy (5) thì từ chối - nút thêm đã bị mờ, đây là lớp thứ hai.
 *
 * @param existing pool đang hiện trên màn hình, để tính `order` và kiểm trần.
 */
export async function createTask(
  uid: string,
  input: TaskInput,
  existing: PoolTask[]
): Promise<string> {
  if (existing.length >= MAX_POOL_TASKS) {
    throw new TaskError(`Pool is full - ${MAX_POOL_TASKS} tasks max.`);
  }
  const now = Date.now();
  const c = clean(input);
  const created = await addDoc(poolCol(uid), {
    ...c,
    order: existing.reduce((m, t) => Math.max(m, t.order), -1) + 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return created.id;
}

/**
 * Sửa task.
 *
 * KHÔNG đụng tới `cells` của bất kỳ tuần nào - kể cả tuần đang xem. Ô đã bật
 * mang bản chụp riêng, và đó là toàn bộ lý do quyết định 14 chạy được. Muốn
 * tuần này dùng giá trị mới thì tắt ô rồi bật lại.
 */
export async function updateTask(uid: string, id: string, input: TaskInput): Promise<void> {
  await updateDoc(poolRef(uid, id), { ...clean(input), updatedAt: Date.now() });
}

/** Xoá mềm. Doc ở lại vĩnh viễn để tuần cũ còn tra được. */
export async function archiveTask(uid: string, id: string): Promise<void> {
  const now = Date.now();
  await updateDoc(poolRef(uid, id), { archivedAt: now, updatedAt: now });
}

/** Undo cho `archiveTask`. */
export async function restoreTask(uid: string, id: string): Promise<void> {
  await updateDoc(poolRef(uid, id), { archivedAt: null, updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Kế hoạch tuần
// ---------------------------------------------------------------------------

export function subscribeWeekPlan(
  uid: string,
  week: string,
  cb: (plan: WeekPlan) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    planRef(uid, week),
    (snap) => cb(snap.exists() ? toPlan(week, snap.data()) : EMPTY_PLAN(week)),
    (e) => onError?.(e)
  );
}

/**
 * Ghi đè `cells` của cả tuần.
 *
 * Ghi cả mảng chứ không patch từng ô: 35 ô là vài trăm byte, mà một mảng ghi
 * một lần thì không bao giờ có trạng thái nửa vời giữa hai lần chạm.
 */
export async function saveWeekPlan(
  uid: string,
  week: string,
  cells: PlannedCell[]
): Promise<void> {
  // Lớp cuối chặn quá 3 task/ngày, phòng khi UI tính sai ở đâu đó.
  const perDay = new Map<number, number>();
  for (const c of cells) perDay.set(c.dow, (perDay.get(c.dow) ?? 0) + 1);
  for (const [dow, n] of perDay) {
    if (n > MAX_TASKS_PER_DAY) {
      throw new TaskError(`Max ${MAX_TASKS_PER_DAY} per day (day ${dow} has ${n}).`);
    }
  }
  await setDoc(planRef(uid, week), { week, cells, updatedAt: Date.now() });
}

export async function getWeekPlan(uid: string, week: string): Promise<WeekPlan> {
  const snap = await getDocs(
    query(planCol(uid), where(documentId(), '==', week))
  );
  const d = snap.docs[0];
  return d ? toPlan(week, d.data()) : EMPTY_PLAN(week);
}

/**
 * Kế hoạch của nhiều tuần liền nhau - MỘT query cho cả cửa sổ Trend.
 * Dùng `documentId()` nên không đụng giới hạn 30 phần tử của `in`.
 */
export async function listWeekPlans(uid: string, weeks: string[]): Promise<Map<string, WeekPlan>> {
  const out = new Map<string, WeekPlan>();
  if (weeks.length === 0) return out;

  const sorted = [...weeks].sort();
  const snap = await getDocs(
    query(
      planCol(uid),
      where(documentId(), '>=', sorted[0]),
      where(documentId(), '<=', sorted[sorted.length - 1]),
      orderBy(documentId())
    )
  );
  const want = new Set(weeks);
  for (const d of snap.docs) {
    if (want.has(d.id)) out.set(d.id, toPlan(d.id, d.data()));
  }
  return out;
}

/** Nhân bản lưới của một tuần sang tuần khác. Ghi đè hoàn toàn. */
export async function copyWeekPlan(uid: string, from: string, to: string): Promise<number> {
  const src = await getWeekPlan(uid, from);
  await saveWeekPlan(uid, to, src.cells);
  return src.cells.length;
}

/** Chỉ dùng cho Undo ngay sau khi tạo task nhầm. */
export async function hardDeleteTask(uid: string, id: string): Promise<void> {
  await deleteDoc(poolRef(uid, id));
}
