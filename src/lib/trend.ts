// ---------------------------------------------------------------------------
// logi - Trend: MỘT category, nhiều kỳ liên tiếp
//
// Khác `bucket.ts`: ở đó các cột được cắt ra từ khoảng đang xem trên màn hình.
// Ở đây cửa sổ tự dựng từ hôm nay lùi về sau, KHÔNG phụ thuộc `RangePicker` -
// câu hỏi "mấy tuần nay Learn đi lên hay đi xuống" không liên quan gì tới
// khoảng đang xem.
//
// Kỳ cuối luôn là kỳ ĐANG chạy và bị đánh dấu `partial`: tuần này mới tới thứ
// Tư thì cột của nó thấp là chuyện đương nhiên, không phải xu hướng.
//
// File thuần: không React, không Firestore.
// ---------------------------------------------------------------------------
import { logicalDate } from '@/lib/balance';
import { daysBetween, weekOf, type Range } from '@/lib/range';
import { addDays } from '@/lib/timeline';
import { addWeeks, weekLabel, weekStart } from '@/lib/week';

export type TrendSpan = '6w' | '12w' | '26w';

// Nhãn gọn để chip vừa một hàng ở 375px. Bỏ chữ "Last" mà nghĩa không đổi:
// "12 weeks" vẫn hiểu là 12 tuần gần nhất.
//
// Không còn span theo THÁNG. Tháng có 4 hoặc 5 tuần nên cột tháng dài tự nhiên
// cao hơn — đó là lịch, không phải xu hướng. Cả app chạy theo tuần (weekTargets,
// WeeklyReview, ngân sách 89h/tuần) nên trend cũng phải đếm bằng tuần thì cột
// mới so được với cột.
export const TREND_SPANS: readonly { value: TrendSpan; label: string }[] = [
  { value: '6w', label: '6 weeks' },
  { value: '12w', label: '12 weeks' },
  { value: '26w', label: '26 weeks' },
];

export const DEFAULT_SPAN: TrendSpan = '6w';

/** `'12w'` → `12`. */
export function spanWeeks(span: TrendSpan): number {
  return Number(span.slice(0, -1));
}

export interface TrendBucket {
  /** Khoá ổn định cho React/Recharts: "2026-W35". */
  key: string;
  /** Nhãn trục X: "W35". */
  label: string;
  range: Range;
  /** Kỳ chưa kết thúc - cột thấp không có nghĩa là làm ít. */
  partial: boolean;
}

/**
 * Các cột của một span, cũ → mới. Cột cuối cùng là kỳ đang chạy.
 *
 * Kỳ đang chạy dừng ở HÔM NAY chứ không kéo tới cuối tuần: ngày chưa tới thì
 * không có dữ liệu, mà target vẫn cộng đủ → cột sẽ trông hụt.
 */
export function trendBuckets(span: TrendSpan, now: number = Date.now()): TrendBucket[] {
  const today = logicalDate(now);
  const count = spanWeeks(span);
  const current = weekOf(today);
  const out: TrendBucket[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const w = addWeeks(current, -i);
    const from = logicalDate(weekStart(w));
    const last = addDays(from, 6);
    const partial = i === 0;
    out.push({
      key: w,
      label: weekLabel(w),
      range: { from, to: partial ? today : last, kind: 'custom', isPartial: partial },
      partial,
    });
  }
  return out;
}

/** Cửa sổ bao cả span - MỘT query duy nhất cho mọi cột. */
export function trendWindow(buckets: TrendBucket[]): { from: string; to: string } {
  return { from: buckets[0].range.from, to: buckets[buckets.length - 1].range.to };
}

/**
 * Bao nhiêu phần của kỳ đang chạy đã trôi qua, 0..1.
 * Dùng để nói "tuần này mới đi được 3/7" chứ không dùng để phóng to cột lên -
 * ngoại suy là bịa số.
 */
export function elapsedFraction(b: TrendBucket, now: number = Date.now()): number {
  if (!b.partial) return 1;
  return Math.min(1, daysBetween(b.range.from, logicalDate(now)) / 7);
}

// ---------------------------------------------------------------------------
// Kỳ trống ≠ kỳ bằng 0
//
// Trước Stage 8, tuần chưa dùng app bị vẽ thành cột 0 và lọt vào dòng so sánh,
// nên chart đọc lên là "W31 0.0h → W35 7.3h · up +7.3h". Người đó không học 0
// giờ tuần W31 - lúc đó app còn chưa có. Cùng lỗi với `sampleSize < 3` bên AI
// insights: thiếu dữ liệu không phải dữ liệu bằng không.
// ---------------------------------------------------------------------------

/** Chỉ cần các field quyết định "kỳ này có ai ghi gì không". */
interface Logged {
  status: string;
  startAt: number;
}

/**
 * Kỳ có ít nhất một session THẬT hay không.
 *
 * `abandoned` là session bỏ dở nên không tính là dữ liệu; `scheduled` là dự
 * định chưa xảy ra. Cả hai mà tính thì một cái hẹn lỡ cũng đủ biến tuần trống
 * thành tuần "có dữ liệu, 0 giờ" - đúng cái cột sai mà ta đang bỏ.
 */
export function hasLogged(
  activities: readonly Logged[],
  range: { from: string; to: string }
): boolean {
  return activities.some((a) => {
    if (a.status === 'abandoned' || a.status === 'scheduled') return false;
    const d = logicalDate(a.startAt);
    return d >= range.from && d <= range.to;
  });
}

export interface TrendPoint {
  label: string;
  /** `null` = kỳ chưa có dữ liệu. Không vẽ cột, không đưa vào so sánh. */
  hours: number | null;
  /** Kỳ đang chạy - cột thấp là vì chưa hết kỳ. */
  partial: boolean;
}

export interface TrendCompare {
  from: TrendPoint;
  to: TrendPoint;
  /** Dương = đi lên. */
  diff: number;
  word: 'up' | 'down' | 'flat';
}

/**
 * Dòng so sánh đầu ↔ cuối, hoặc `null` khi không đủ căn cứ.
 *
 * Bỏ kỳ dở dang và kỳ trống. Dưới 2 kỳ dùng được thì ẩn hẳn dòng chữ - thà
 * không nói còn hơn nói một xu hướng dựng từ một điểm.
 *
 * `flatBelow` là ngưỡng coi như đứng yên, tính theo cùng đơn vị với `hours`.
 * Mặc định 0.5 (giờ). Khi điểm là phần trăm thì chỗ gọi truyền 5 - lệch 5 điểm
 * phần trăm qua nhiều tuần là nhiễu, không phải chuyển biến.
 */
export function trendCompare(
  points: readonly TrendPoint[],
  flatBelow = 0.5
): TrendCompare | null {
  const usable = points.filter((p) => !p.partial && p.hours !== null);
  if (usable.length < 2) return null;

  const from = usable[0];
  const to = usable[usable.length - 1];
  const diff = (to.hours as number) - (from.hours as number);
  return {
    from,
    to,
    diff,
    word: Math.abs(diff) < flatBelow ? 'flat' : diff > 0 ? 'up' : 'down',
  };
}

// ---------------------------------------------------------------------------
// Cắt kỳ trống ở ĐẦU
//
// "26 tuần" nghĩa là TỐI ĐA 26 tuần. Tài khoản mới chỉ có 3 tuần dữ liệu mà vẽ
// đủ 26 ô thì 23 ô đầu là chỗ chết — chart trông như hỏng. Cắt phần đầu rồi thì
// chip không phải chạy theo tuổi tài khoản nữa: bấm 26w hôm nay ra 3 cột, vài
// tháng nữa nó tự đầy lên.
//
// CHỈ cắt ở đầu. Tuần trống ở GIỮA phải giữ - đó là tuần bạn thật sự nghỉ, là
// thông tin, không phải chỗ thừa.
// ---------------------------------------------------------------------------

/**
 * Sàn số cột. Một chart 1 cột trông như lỗi render chứ không như dữ liệu; 3 cột
 * là mức tối thiểu để mắt thấy được một hình dạng.
 */
export const MIN_TREND_BUCKETS = 3;

/**
 * Bỏ các kỳ trống ở đầu mảng. Không kỳ nào có dữ liệu → `[]` (chỗ gọi tự hiện
 * trạng thái rỗng của nó).
 *
 * Nếu cắt xong còn dưới `MIN_TREND_BUCKETS` thì nhả bớt ra cho đủ sàn: mấy ô
 * trống thêm vào là tuần có thật, để trống là đúng.
 */
export function trimLeadingEmpty<T>(buckets: readonly T[], hasData: (b: T) => boolean): T[] {
  const first = buckets.findIndex(hasData);
  if (first === -1) return [];
  const start = Math.min(first, Math.max(0, buckets.length - MIN_TREND_BUCKETS));
  return buckets.slice(start);
}

// ---------------------------------------------------------------------------
// Bar hay line
//
// Bar trả lời "nhiều hay ít so với target" nhưng trên 375px chỉ đẹp tới ~13 cột;
// quá đó thì cột mảnh và nhãn trục X chồng nhau. Line trả lời "đang lên hay
// xuống" và chịu được nhiều điểm - đổi bởi SỐ CỘT, không phải bởi span, vì span
// đã bị cắt đầu nên không đoán được số cột từ tên span.
// ---------------------------------------------------------------------------

export const MAX_BARS = 13;

export function chartKind(bucketCount: number): 'bars' | 'line' {
  return bucketCount > MAX_BARS ? 'line' : 'bars';
}

/**
 * Nhãn trục X thưa ra khi nhiều cột: 1 nhãn / 4 cột. Trả về giá trị cho prop
 * `interval` của Recharts XAxis (0 = hiện hết, 3 = bỏ 3 hiện 1).
 */
export function labelInterval(bucketCount: number): number {
  return bucketCount > MAX_BARS ? 3 : 0;
}

/**
 * Phần trăm so với target của cùng kỳ đó. `null` khi kỳ không có dữ liệu hoặc
 * target bằng 0 - chia cho 0 ra Infinity, mà "không đặt target" không phải là
 * "trượt target".
 *
 * Span dài vẽ tỉ lệ chứ không vẽ giờ: qua 26 tuần target có thể đổi nhiều lần,
 * đường chuẩn sẽ nhấp nhô khó đọc, còn mốc 100% thì luôn nằm một chỗ.
 */
export function onTrackPct(actual: number | null, expected: number): number | null {
  if (actual === null || expected <= 0) return null;
  return (actual / expected) * 100;
}
