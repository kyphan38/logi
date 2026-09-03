// ---------------------------------------------------------------------------
// logi - Task checklist tuần (Stage 8)
//
// App vốn đo GIỜ THEO CATEGORY. "Learn 3h" không phân biệt được shadowing với
// đọc blog. Task đặt tên và thời lượng cho một việc cụ thể, và bắt phải quyết
// định TRƯỚC khi ngày bắt đầu.
//
// Hai luật khiến file này tồn tại:
//
//  1. Ô trong lưới mang BẢN CHỤP (`PlannedCell`), không mang con trỏ tới pool.
//     Mọi hàm ở đây chỉ đọc `cells`, không bao giờ tra ngược `PoolTask` để lấy
//     thời lượng - đó chính là cách lịch sử bị viết lại (quyết định 14).
//  2. Chỉ session có `taskId` mới tính (quyết định 5). Không đoán theo label.
//
// File thuần: không React, không Firestore, không DOM.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { dailyTargetFor } from '@/lib/day-target';
import { weekStart } from '@/lib/week';
import {
  CATEGORIES,
  MAX_TASKS_PER_DAY,
  type Activity,
  type Category,
  type PlannedCell,
  type PoolTask,
} from '@/types/logi';

const MS_MIN = 60_000;
const DOWS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Thứ Hai → Chủ nhật. Lưới đọc theo tuần ISO, không theo `Date.getDay()`. */
export const GRID_DOWS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export const DOW_LABEL: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/** `45` → `45m`, `90` → `1h 30m`, `120` → `2h`. */
export function shortDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Lưới: bật / tắt ô
// ---------------------------------------------------------------------------

export function cellAt(cells: PlannedCell[], taskId: string, dow: number): PlannedCell | null {
  return cells.find((c) => c.taskId === taskId && c.dow === dow) ?? null;
}

export function cellsOfDow(cells: PlannedCell[], dow: number): PlannedCell[] {
  return cells.filter((c) => c.dow === dow);
}

export function countOfDow(cells: PlannedCell[], dow: number): number {
  return cellsOfDow(cells, dow).length;
}

/** Ngày đã đủ 3 task thì ô thứ 4 bị chặn (quyết định 3). */
export function dayIsFull(cells: PlannedCell[], dow: number): boolean {
  return countOfDow(cells, dow) >= MAX_TASKS_PER_DAY;
}

/** Bản chụp của một task tại thời điểm gán. */
export function snapshotOf(task: PoolTask, dow: number): PlannedCell {
  return {
    taskId: task.id,
    dow,
    title: task.title,
    durationMin: task.durationMin,
    category: task.category,
  };
}

export type ToggleResult =
  | { ok: true; cells: PlannedCell[]; turnedOn: boolean }
  | { ok: false; reason: string };

/**
 * Bật/tắt một ô. Tắt thì luôn được; bật thì phải còn chỗ trong ngày.
 * Trả về mảng MỚI - người gọi tự quyết định lúc nào ghi xuống Firestore.
 */
export function toggleCell(
  cells: PlannedCell[],
  task: PoolTask,
  dow: number
): ToggleResult {
  if (cellAt(cells, task.id, dow)) {
    return {
      ok: true,
      turnedOn: false,
      cells: cells.filter((c) => !(c.taskId === task.id && c.dow === dow)),
    };
  }
  if (dayIsFull(cells, dow)) {
    return { ok: false, reason: `Max ${MAX_TASKS_PER_DAY} per day` };
  }
  return { ok: true, turnedOn: true, cells: [...cells, snapshotOf(task, dow)] };
}

/**
 * Bật hàng loạt (kéo-để-tô trên desktop, hoặc chạm nhãn hàng).
 *
 * Ngày nào đã đầy thì BỎ QUA ngày đó, không huỷ cả thao tác: kéo ngang qua 7
 * ngày mà một ngày đầy thì 6 ngày kia vẫn phải bật được.
 */
export function paintRow(
  cells: PlannedCell[],
  task: PoolTask,
  dows: readonly number[],
  on: boolean
): { cells: PlannedCell[]; blocked: number } {
  let out = cells;
  let blocked = 0;
  for (const dow of dows) {
    const has = cellAt(out, task.id, dow) !== null;
    if (on === has) continue;
    if (!on) {
      out = out.filter((c) => !(c.taskId === task.id && c.dow === dow));
      continue;
    }
    if (dayIsFull(out, dow)) {
      blocked++;
      continue;
    }
    out = [...out, snapshotOf(task, dow)];
  }
  return { cells: out, blocked };
}

/** Chạm tên thứ → xoá sạch ngày đó. */
export function clearDow(cells: PlannedCell[], dow: number): PlannedCell[] {
  return cells.filter((c) => c.dow !== dow);
}

/** Hàng này đã bật hết 7 ngày chưa - quyết định chạm nhãn hàng là bật hay tắt. */
export function rowIsFull(cells: PlannedCell[], taskId: string): boolean {
  return DOWS.every((d) => cellAt(cells, taskId, d) !== null);
}

// ---------------------------------------------------------------------------
// Cảnh báo vượt target ngày (quyết định 9)
// ---------------------------------------------------------------------------

/** Giờ dự kiến của một ngày, tách theo category. Đọc từ bản chụp. */
export function plannedHoursByCategory(
  cells: PlannedCell[],
  dow: number
): Record<Category, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const c of cellsOfDow(cells, dow)) out[c.category] += c.durationMin / 60;
  return out;
}

export interface OverTarget {
  dow: number;
  category: Category;
  planned: number;
  target: number;
  /** `Mon · Learn 4.0h planned vs 3.0h target` */
  text: string;
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Cảnh báo, KHÔNG chặn. Một ngày có thể vượt ở nhiều category, và câu chữ phải
 * nói rõ category nào - "Monday is over target" không cho biết phải bỏ ô nào.
 *
 * @param weekly target tuần đang áp dụng. `null` (chưa tải xong) → không cảnh
 *   báo: thà im lặng còn hơn báo sai.
 */
export function overTargetWarnings(
  cells: PlannedCell[],
  weekly: Record<Category, number> | null
): OverTarget[] {
  if (!weekly) return [];
  const out: OverTarget[] = [];

  for (const dow of GRID_DOWS) {
    const planned = plannedHoursByCategory(cells, dow);
    const target = dailyTargetFor(dow, weekly);
    for (const c of CATEGORIES) {
      // Làm tròn tới 0.1h trước khi so: 3.0h dự kiến với 2.999h target là cùng
      // một con số trên màn hình, cảnh báo ở đó chỉ gây nhiễu.
      if (planned[c] <= 0) continue;
      if (Math.round(planned[c] * 10) <= Math.round(target[c] * 10)) continue;
      out.push({
        dow,
        category: c,
        planned: planned[c],
        target: target[c],
        text: `${DOW_LABEL[dow]} · ${cap(c)} ${h1(planned[c])}h planned vs ${h1(target[c])}h target`,
      });
    }
  }
  return out;
}

function cap(c: Category): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Những ngày có ít nhất một cảnh báo - để tô cột trong lưới. */
export function warnedDows(warnings: OverTarget[]): Set<number> {
  return new Set(warnings.map((w) => w.dow));
}

// ---------------------------------------------------------------------------
// Tiến độ & hoàn thành (quyết định 6, 7, 8)
// ---------------------------------------------------------------------------

/**
 * Số phút đã làm cho một task trong MỘT ngày logic.
 *
 * Cộng dồn mọi session mang `taskId` đó (quyết định 6: nhiều lần log trong
 * ngày thì cộng lại). Session đang chạy tính tới `now` - đó là phần hiển thị
 * tiến độ; việc ĐÁNH DẤU hoàn thành chỉ xảy ra lúc bấm Stop (quyết định 7).
 */
export function minutesForTask(
  activities: Activity[],
  taskId: string,
  date: string,
  now: number = Date.now()
): number {
  let ms = 0;
  for (const a of activities) {
    if (a.taskId !== taskId) continue;
    if (a.status === 'abandoned' || a.status === 'scheduled') continue;
    if (logicalDate(a.startAt) !== date) continue;
    const end = a.endAt ?? now;
    if (end > a.startAt) ms += end - a.startAt;
  }
  return ms / MS_MIN;
}

export interface ChecklistRow {
  taskId: string;
  title: string;
  category: Category;
  /** Thời lượng dự kiến, từ bản chụp của tuần đó. */
  durationMin: number;
  /** Đã làm bao nhiêu phút (session đang chạy tính tới `now`). */
  doneMin: number;
  /** `doneMin >= durationMin`. */
  done: boolean;
  /** Có session của task này đang chạy → hiện Stop. */
  runningId: string | null;
  /** 0..1 cho thanh tiến độ. */
  fill: number;
  /** `18 / 30m` */
  label: string;
}

/**
 * Checklist của MỘT ngày logic.
 *
 * @param cells ô đã bật của cả tuần; hàm tự lọc theo `dow`.
 * @param date  ngày logic đang xem - cũng là mốc đếm lại từ 0 mỗi sáng
 *   (quyết định 8: chưa xong thì KHÔNG dồn sang hôm sau).
 */
export function checklistFor(
  cells: PlannedCell[],
  activities: Activity[],
  date: string,
  dow: number,
  now: number = Date.now()
): ChecklistRow[] {
  return cellsOfDow(cells, dow).map((c) => {
    const doneMin = minutesForTask(activities, c.taskId, date, now);
    // Cùng điều kiện ngày với `minutesForTask`. Session mở từ đêm qua thuộc
    // về hôm qua: hiện Stop trên hàng hôm nay mà tiến độ vẫn 0 là vô lý.
    const running = activities.find(
      (a) =>
        a.taskId === c.taskId &&
        a.status === 'active' &&
        a.endAt === null &&
        logicalDate(a.startAt) === date
    );
    return {
      taskId: c.taskId,
      title: c.title,
      category: c.category,
      durationMin: c.durationMin,
      doneMin,
      done: doneMin >= c.durationMin,
      runningId: running?.id ?? null,
      fill: c.durationMin > 0 ? Math.min(1, Math.max(0, doneMin / c.durationMin)) : 0,
      label: `${Math.floor(doneMin)} / ${shortDuration(c.durationMin)}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Trải kế hoạch tuần ra thành ngày cụ thể - cho Trend
// ---------------------------------------------------------------------------

export interface PlannedDay {
  /** Ngày logic "2026-08-26". */
  date: string;
  taskId: string;
  title: string;
  durationMin: number;
  category: Category;
}

/**
 * Một ô (`week`, `dow`) → một ngày logic cụ thể.
 *
 * Đi qua `weekStart()` (12:00 trưa thứ Hai) rồi cộng ngày, nên không bao giờ
 * lệch một tuần vì mốc cắt 04:00.
 */
export function dateOfCell(week: string, dow: number): string {
  // ISO: thứ Hai là ngày đầu tuần. `dow` 0 = CN nên nó là ngày thứ 7.
  const offset = dow === 0 ? 6 : dow - 1;
  const d = new Date(weekStart(week));
  d.setDate(d.getDate() + offset);
  return logicalDate(d.getTime());
}

export function expandPlan(week: string, cells: PlannedCell[]): PlannedDay[] {
  return cells.map((c) => ({
    date: dateOfCell(week, c.dow),
    taskId: c.taskId,
    title: c.title,
    durationMin: c.durationMin,
    category: c.category,
  }));
}

export interface TaskTally {
  taskId: string;
  title: string;
  planned: number;
  completed: number;
}

/**
 * Bao nhiêu ngày đã lên kế hoạch, bao nhiêu ngày làm đủ - trong một khoảng.
 *
 * Đây là chỗ lộ ra task nào luôn bị bỏ. Task luôn bỏ thường là task đặt sai,
 * không phải người lười.
 */
export function tallyTasks(
  plan: PlannedDay[],
  activities: Activity[],
  range: { from: string; to: string },
  now: number = Date.now()
): TaskTally[] {
  const byTask = new Map<string, TaskTally>();

  for (const p of plan) {
    if (p.date < range.from || p.date > range.to) continue;
    // Ngày chưa tới thì chưa thể "bỏ" - không đưa vào mẫu số.
    if (p.date > logicalDate(now)) continue;

    // Tên mới nhất thắng: đổi tên task rồi thì bảng đọc lên phải là tên đang dùng.
    const cur = byTask.get(p.taskId) ?? { taskId: p.taskId, title: p.title, planned: 0, completed: 0 };
    cur.title = p.title;
    cur.planned++;
    if (minutesForTask(activities, p.taskId, p.date, now) >= p.durationMin) cur.completed++;
    byTask.set(p.taskId, cur);
  }

  return [...byTask.values()].sort((a, b) => b.planned - a.planned || a.title.localeCompare(b.title));
}

/** Tỉ lệ hoàn thành gộp của một khoảng. Không có ô nào đã lên kế hoạch → null. */
export function completionRate(tallies: TaskTally[]): number | null {
  const planned = tallies.reduce((a, t) => a + t.planned, 0);
  if (planned === 0) return null;
  return tallies.reduce((a, t) => a + t.completed, 0) / planned;
}
