// ---------------------------------------------------------------------------
// logi - Routine: checklist hằng ngày (Stage 10)
//
// Khác task Stage 8: không thời lượng, không Start/Stop, không category. Chỉ
// tick. Template lặp lại theo thứ trong tuần cho tới khi người dùng sửa.
//
// File thuần: không React, không Firestore - test bằng `node --test`.
// ---------------------------------------------------------------------------
import { ROUTINE_ITEM_MAX, type RoutineGroup, type RoutineItem } from '@/types/logi';

/** Thứ Hai → Chủ nhật. Giá trị theo `Date.getDay()` (0 = CN). */
export const GRID_DOWS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_SHORT: Record<number, string> = { ...SHORT };
export const DOW_LETTER: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };

export interface RoutineDayGroup {
  group: RoutineGroup;
  items: RoutineItem[];
  done: number;
}

/** Mục của một thứ, giữ đúng thứ tự trong nhóm. */
export function itemsForDay(group: RoutineGroup, dow: number): RoutineItem[] {
  return group.items.filter((i) => i.days.includes(dow));
}

/**
 * Checklist của một ngày cho màn Now.
 *
 * Nhóm hôm nay trống thì bỏ hẳn (VD ngày nghỉ tập). Tick của mục đã bị xoá
 * khỏi template vẫn nằm trong doc ngày, nhưng không được đếm - chỉ đếm mục
 * đang hiện.
 */
export function routineForDay(
  groups: RoutineGroup[],
  dow: number,
  isChecked: (itemId: string) => boolean
): RoutineDayGroup[] {
  const out: RoutineDayGroup[] = [];
  for (const group of groups) {
    const items = itemsForDay(group, dow);
    if (items.length === 0) continue;
    const done = items.filter((i) => isChecked(i.id)).length;
    out.push({ group, items, done });
  }
  return out;
}

/** Thứ không hợp lệ bị bỏ, trùng bị gộp, xếp T2 → CN cho dễ đọc. */
export function cleanDays(days: number[]): number[] {
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return GRID_DOWS.filter((d) => set.has(d));
}

export function cleanText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, ROUTINE_ITEM_MAX);
}

/** Thêm hoặc sửa một mục. Mục không còn ngày nào vẫn được giữ, chỉ không hiện. */
export function upsertItem(items: RoutineItem[], next: RoutineItem): RoutineItem[] {
  const item = { id: next.id, text: cleanText(next.text), days: cleanDays(next.days) };
  const i = items.findIndex((x) => x.id === item.id);
  if (i === -1) return [...items, item];
  const out = items.slice();
  out[i] = item;
  return out;
}

export function removeItem(items: RoutineItem[], id: string): RoutineItem[] {
  return items.filter((x) => x.id !== id);
}

/**
 * Đổi chỗ một mục với mục kề nó TRONG CÙNG NGÀY đang xem.
 *
 * Mục của ngày khác nằm xen giữa thì được bỏ qua: người dùng chỉ thấy danh
 * sách của một ngày, nên "lên một dòng" phải là dòng họ đang thấy.
 */
export function moveItem(
  items: RoutineItem[],
  id: string,
  dir: -1 | 1,
  dow: number | null
): RoutineItem[] {
  const visible = (x: RoutineItem) => dow === null || x.days.includes(dow);
  const from = items.findIndex((x) => x.id === id);
  if (from === -1) return items;
  let to = from + dir;
  while (to >= 0 && to < items.length && !visible(items[to])) to += dir;
  if (to < 0 || to >= items.length) return items;
  const out = items.slice();
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

/** "Mon, Wed, Fri" / "Every day" / "Weekdays" - cho chế độ xem All. */
export function daysLabel(days: number[]): string {
  const d = cleanDays(days);
  if (d.length === 0) return 'No day';
  if (d.length === 7) return 'Every day';
  if (d.length === 5 && d.every((x) => x >= 1 && x <= 5)) return 'Weekdays';
  if (d.length === 2 && d.includes(0) && d.includes(6)) return 'Weekends';
  return d.map((x) => SHORT[x]).join(', ');
}

