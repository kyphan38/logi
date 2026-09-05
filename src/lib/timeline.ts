// ---------------------------------------------------------------------------
// logi - Layout cho Timeline (History)
// Hàm thuần, không đụng React. Mọi tính toán vị trí block nằm ở đây.
// ---------------------------------------------------------------------------
import { clockTime } from '@/lib/datetime';
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
  start: number;
  /** Giờ kết thúc THẬT, không cắt ở 04:00 hôm sau (xem AMENDMENT sleep). */
  end: number;
  lane: number;
  /** Giờ kết thúc rơi sang ngày lịch khác giờ bắt đầu → nhãn "→ next day". */
  crossesMidnight: boolean;
}

/** Ngày lịch (không phải ngày logic) của một mốc thời gian. */
function calendarDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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
    // Session chưa xong thì kéo tới bây giờ; đã xong thì giữ NGUYÊN giờ kết
    // thúc thật, kể cả khi nó vượt 04:00 hôm sau. Một giấc ngủ là một hàng.
    const end = a.endAt ?? Math.min(now, win.end);
    const start = Math.max(a.startAt, win.start);
    if (end <= start) continue;

    let lane = lanes.findIndex((lastEnd) => lastEnd <= start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = Math.max(end, start + MIN_BLOCK_MS);

    segments.push({
      activity: a,
      start,
      end,
      lane,
      crossesMidnight: calendarDay(a.startAt) !== calendarDay(end),
    });
  }

  return { segments, laneCount: Math.max(1, lanes.length) };
}

export interface Gap {
  start: number;
  end: number;
}

export interface DayGaps {
  /** Giờ thực sự có log (đã gộp phần chồng nhau). */
  trackedH: number;
  /** Giờ trống NẰM GIỮA activity đầu và cuối. */
  gapH: number;
  gaps: Gap[];
  /** Mép trái của timeline: activity sớm nhất. null = ngày trống. */
  from: number | null;
  /** Mép phải: activity muộn nhất, hoặc `now` nếu là hôm nay. */
  to: number | null;
}

const EMPTY_DAY: DayGaps = { trackedH: 0, gapH: 0, gaps: [], from: null, to: null };

/**
 * Khoảng trống CHỈ tính giữa activity đầu tiên và activity cuối cùng
 * (AMENDMENT-remove-sleep mục 6).
 *
 * Bỏ Sleep thì mỗi ngày có một khoảng 22:00 -> 04:30 không còn ai log. Tính nó
 * là "chưa log" thì ngày nào cũng hiện `6h 30m untracked`, trông như quên log
 * trong khi thực ra không có gì để log. Phần trước cái đầu tiên và sau cái cuối
 * cùng không hiển thị, không tính.
 */
export function dayGaps(segments: Segment[], win: DayWindow, now: number): DayGaps {
  const limit = Math.min(win.end, Math.max(now, win.start));

  const inWin: Gap[] = [];
  for (const s of segments) {
    const start = Math.max(s.start, win.start);
    const end = Math.min(s.end, limit);
    if (end > start) inWin.push({ start, end });
  }
  if (inWin.length === 0) return EMPTY_DAY;

  inWin.sort((a, b) => a.start - b.start);

  // Mép trái = activity sớm nhất. Mép phải = activity muộn nhất - trừ ngày hôm
  // nay: khoảng từ record cuối tới `now` đúng là khoảng chưa log.
  // Ngày đã qua thì dừng ở record cuối, không kéo tới 04:00 hôm sau.
  const from = inWin[0].start;
  const lastEnd = Math.max(...inWin.map((g) => g.end));
  const isToday = now < win.end;
  const to = isToday ? Math.max(lastEnd, limit) : lastEnd;

  const merged: Gap[] = [];
  for (const g of inWin) {
    const last = merged[merged.length - 1];
    if (last && g.start <= last.end) last.end = Math.max(last.end, g.end);
    else merged.push({ start: g.start, end: g.end });
  }

  const trackedMs = merged.reduce((sum, m) => sum + (m.end - m.start), 0);

  const gaps: Gap[] = [];
  let cursor = from;
  for (const m of merged) {
    if (m.start - cursor >= MIN_GAP_MS) gaps.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (to - cursor >= MIN_GAP_MS) gaps.push({ start: cursor, end: to });

  return {
    trackedH: trackedMs / 3_600_000,
    gapH: Math.max(0, to - from - trackedMs) / 3_600_000,
    gaps,
    from,
    to,
  };
}

// ---------------------------------------------------------------------------
// Bố cục co giãn (Stage 4.5)
//
// Tỉ lệ tuyến tính 24h = 1440px để vẽ 5–8 record: phần lớn màn hình là
// khoảng trống. Ở đây khối có dữ liệu giữ chiều cao đọc được, còn khoảng
// trống thu về một dòng.
// ---------------------------------------------------------------------------

/** Chạm được bằng ngón tay theo chuẩn iOS, kể cả session 5 phút. */
export const ELASTIC_MIN_PX = 44;
/** Một buổi học 6h liền không được chiếm hết màn hình. */
export const ELASTIC_MAX_PX = 132;
export const ELASTIC_SLOPE = 0.22;
/** Dòng "untracked" - cao vừa đủ đọc, không hơn. */
export const GAP_ROW_PX = 32;

/**
 * Bán tỉ lệ, chặn hai đầu. Mất tính tỉ lệ chính xác, nhưng thời lượng luôn
 * được viết bằng chữ trên block nên thông tin không mất.
 */
export function blockHeight(durationMs: number): number {
  const min = durationMs / 60_000;
  const raw = ELASTIC_MIN_PX + (min - 30) * ELASTIC_SLOPE;
  return Math.min(ELASTIC_MAX_PX, Math.max(ELASTIC_MIN_PX, raw));
}

export interface BlockRow {
  kind: 'blocks';
  key: string;
  start: number;
  height: number;
  /** Cùng khung giờ → nằm cạnh nhau, chia đều bề ngang. */
  blocks: Segment[];
}

export interface GapRow {
  kind: 'gap';
  key: string;
  start: number;
  end: number;
}

export type Row = BlockRow | GapRow;

/**
 * Gom segment chồng giờ thành cụm, rồi trộn với các khoảng trống theo thứ tự
 * thời gian. Không dùng `position: absolute` nữa - block dưới sẽ bấm được.
 *
 * `gaps` lấy thẳng từ `dayGaps()` nên đã bỏ sẵn phần tương lai của ngày hôm
 * nay, các khoảng ngắn hơn 30 phút, và hai đầu ngày không có log.
 */
export function elasticRows(segments: Segment[], gaps: Gap[]): Row[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.lane - b.lane);

  const clusters: Segment[][] = [];
  let reach = -Infinity;
  for (const s of sorted) {
    if (s.start < reach && clusters.length > 0) clusters[clusters.length - 1].push(s);
    else clusters.push([s]);
    reach = Math.max(reach, s.end);
  }

  const blockRows: BlockRow[] = clusters.map((blocks) => ({
    kind: 'blocks',
    key: `b${blocks[0].start}-${blocks[0].activity.id}`,
    start: blocks[0].start,
    // Chiều cao hàng = block cao nhất trong nhóm.
    height: Math.max(...blocks.map((b) => blockHeight(b.end - b.start))),
    blocks: [...blocks].sort((a, b) => a.lane - b.lane),
  }));

  const gapRows: GapRow[] = gaps.map((g) => ({
    kind: 'gap',
    key: `g${g.start}`,
    start: g.start,
    end: g.end,
  }));

  return [...blockRows, ...gapRows].sort((a, b) => a.start - b.start);
}

/** Mốc thời gian → toạ độ px trong khung 1440px. */
export function toPx(ts: number, win: DayWindow): number {
  return ((ts - win.start) / 3_600_000) * HOUR_PX;
}

/** "10:00 PM – 4:30 AM". Nhãn "→ next day" và thời lượng vẽ riêng ở Timeline. */
export function formatClockRange(start: number, end: number): string {
  return `${clockTime(start)} – ${clockTime(end)}`;
}

export function formatGap(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
