// ---------------------------------------------------------------------------
// logi - Bedtime (Stage 8)
//
// Phiên bản nhẹ của Sleep đã gỡ: ghi MỘT MỐC, không phải một khoảng. Né được
// toàn bộ rắc rối cũ - start/stop, vắt qua nửa đêm, chia block, ngân sách giờ.
//
// Cả file xoay quanh MỘT ý: giờ đi ngủ phải được quy về THANG LIÊN TỤC trước
// khi tính trung vị hay độ dao động.
//
//     22:00 → 22.0     00:15 → 24.25     01:30 → 25.5
//
// Không làm bước này thì trung vị của 22:00 và 00:15 ra 11 giờ trưa. Hai đêm
// đó chênh nhau 135 phút, không phải 22 tiếng.
//
// File thuần: không React, không Firestore, không DOM.
// ---------------------------------------------------------------------------
import { DAY_CUTOFF_HOUR } from '@/types/logi';

/**
 * Mốc đi ngủ → số giờ trên thang liên tục của ngày logic.
 *
 * Dùng ĐÚNG mốc 04:00 của `logicalDate()`: giờ trước 04:00 thuộc về đêm của
 * ngày hôm trước, nên nó nằm ở phía SAU 24 chứ không phải đầu ngày mới.
 */
export function bedtimeScale(ts: number): number {
  const d = new Date(ts);
  const h = d.getHours() + d.getMinutes() / 60;
  return h < DAY_CUTOFF_HOUR ? h + 24 : h;
}

/** 22.0 → "22:00", 24.25 → "00:15", 25.5 → "01:30". */
export function formatScale(scale: number): string {
  // Làm tròn tới phút TRƯỚC khi tách giờ/phút: 23.999h mà tách trước sẽ ra
  // "23:60".
  const totalMin = Math.round(scale * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Mốc epoch → "22:00". Đường tắt cho chỗ chỉ cần hiện giờ đã ghi. */
export function formatBedtime(ts: number): string {
  return formatScale(bedtimeScale(ts));
}

/**
 * Trung vị. Mảng rỗng → null.
 *
 * Chẵn phần tử thì lấy trung bình hai giá trị giữa, đúng định nghĩa. Với thang
 * liên tục ở trên thì phép trung bình này an toàn - trên thang 0..24 thì không.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface BedtimeStats {
  /** Trung vị trên thang liên tục. */
  median: number;
  min: number;
  max: number;
  /** Số đêm đã ghi. */
  n: number;
}

/**
 * Thống kê một nhóm đêm. Không có đêm nào → `null`, KHÔNG phải 0.
 *
 * Đây là cùng một luật với `sampleSize < 3` ở AI insights và với cột trống ở
 * Trend: thiếu dữ liệu không phải dữ liệu bằng không.
 */
export function bedtimeStats(timestamps: number[]): BedtimeStats | null {
  if (timestamps.length === 0) return null;
  const scales = timestamps.map(bedtimeScale);
  return {
    median: median(scales)!,
    min: Math.min(...scales),
    max: Math.max(...scales),
    n: scales.length,
  };
}
