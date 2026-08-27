// ---------------------------------------------------------------------------
// logi — Layout cho Timeline (History)
// Hàm thuần, không đụng React. Mọi tính toán vị trí block nằm ở đây.
// ---------------------------------------------------------------------------
import { DAY_CUTOFF_HOUR, type Activity } from '@/types/logi';

/** Chiều cao 1 giờ (px) → 1 ngày = 1440px. */
export const HOUR_PX = 60;
export const DAY_MS = 24 * 3_600_000;

/** Block ngắn vẫn phải cao tối thiểu 24px ⇒ chiếm chỗ tương đương 24 phút. */
export const MIN_BLOCK_PX = 24;
const MIN_BLOCK_MS = (MIN_BLOCK_PX / HOUR_PX) * 3_600_000;

/** Khoảng trống ngắn hơn mức này thì bỏ qua. */
export const MIN_GAP_MS = 30 * 60_000;

export interface DayWindow {
  start: number; // 04:00 ngày logic
  end: number; // 04:00 hôm sau
}

/** "2026-08-26" → mốc 04:00 → 04:00 hôm sau (giờ địa phương). */
export function dayWindow(date: string): DayWindow {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, DAY_CUTOFF_HOUR, 0, 0, 0).getTime();
  return { start, end: start + DAY_MS };
}

/** "2026-08-26" + n ngày → "2026-08-27". */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export interface Segment {
  activity: Activity;
  /** Đã cắt gọn trong cửa sổ ngày. */
  start: number;
  end: number;
  lane: number;
  /** true khi session tràn qua mốc 04:00 hôm sau. */
  clippedEnd: boolean;
  /**
   * true khi session bắt đầu trước 04:00 — tức kéo sang từ ngày logic trước
   * (VD ngủ 22:00 → 06:00). Vẽ ở đầu timeline để ngày không bị thủng lỗ.
   */
  continuedFromPrevious: boolean;
}

export interface Layout {
  segments: Segment[];
  laneCount: number;
}

/**
 * Xếp lane cho các block chồng nhau.
 *
 *   1. Sắp xếp theo startAt tăng dần
 *   2. Tìm lane đầu tiên có lastEnd <= startAt
 *   3. Không có → mở lane mới
 *
 * `lastEnd` dùng chiều cao *hiển thị* (tối thiểu 24px), nếu không hai session
 * 5 phút liền nhau sẽ đè lên nhau trên màn hình dù giờ giấc không chồng.
 */
export function layoutDay(activities: Activity[], win: DayWindow, now: number): Layout {
  const segments: Segment[] = [];
  const lanes: number[] = []; // lastEnd của từng lane

  const sorted = [...activities].sort((a, b) => a.startAt - b.startAt);

  for (const a of sorted) {
    const rawEnd = a.endAt ?? Math.min(now, win.end);
    const start = Math.max(a.startAt, win.start);
    const end = Math.min(rawEnd, win.end);
    if (end <= start) continue;

    let lane = lanes.findIndex((lastEnd) => lastEnd <= start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = Math.max(end, start + MIN_BLOCK_MS);

    segments.push({
      activity: a,
      start,
      end,
      lane,
      clippedEnd: rawEnd > win.end,
      continuedFromPrevious: a.startAt < win.start,
    });
  }

  return { segments, laneCount: Math.max(1, lanes.length) };
}

export interface Gap {
  start: number;
  end: number;
}

export interface Coverage {
  /** Giờ thực sự có log (đã gộp phần chồng nhau). */
  trackedH: number;
  /** Phần đã trôi qua trong ngày mà không có log nào. */
  untrackedH: number;
  gaps: Gap[];
}

/**
 * Gộp các khoảng đã log rồi lấy phần bù → khoảng trống.
 * Với ngày hôm nay chỉ xét tới `now`; tương lai không tính là "untracked".
 */
export function coverageOfDay(segments: Segment[], win: DayWindow, now: number): Coverage {
  const limit = Math.min(win.end, Math.max(now, win.start));

  const merged: Gap[] = [];
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const start = s.start;
    const end = Math.min(s.end, limit);
    if (end <= start) continue;
    const last = merged[merged.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }

  const trackedMs = merged.reduce((sum, m) => sum + (m.end - m.start), 0);

  const gaps: Gap[] = [];
  let cursor = win.start;
  for (const m of merged) {
    if (m.start - cursor >= MIN_GAP_MS) gaps.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (limit - cursor >= MIN_GAP_MS) gaps.push({ start: cursor, end: limit });

  return {
    trackedH: trackedMs / 3_600_000,
    untrackedH: Math.max(0, limit - win.start - trackedMs) / 3_600_000,
    gaps,
  };
}

/** Mốc thời gian → toạ độ px trong khung 1440px. */
export function toPx(ts: number, win: DayWindow): number {
  return ((ts - win.start) / 3_600_000) * HOUR_PX;
}

/** "8:00–11:00 · 3h" */
export function formatRange(start: number, end: number): string {
  const t = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const h = (end - start) / 3_600_000;
  const dur = h >= 1 ? `${+h.toFixed(1)}h` : `${Math.round(h * 60)}m`;
  return `${t(start)}–${t(end)} · ${dur}`;
}

export function formatGap(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
