// ---------------------------------------------------------------------------
// logi - Đọc một chuỗi giờ "HH:MM" thành mốc epoch
//
// Người dùng gõ giờ, KHÔNG bao giờ gõ ngày. Ngày được suy ra bằng một luật duy
// nhất, dùng chung cho cả sheet "khi nào bắt đầu" lẫn sheet bedtime:
//
//     'past'   → lần xuất hiện GẦN NHẤT TRONG QUÁ KHỨ của giờ đó
//     'future' → lần xuất hiện KẾ TIẾP
//
// Luật này tự giải đúng ca vắt qua nửa đêm, chỗ mà một ô chọn ngày sẽ bắt người
// dùng phải tự nghĩ:
//
//     T7 07:30 + "23:30" → T6 23:30      (giờ đó hôm nay chưa tới, nên là hôm qua)
//     T7 07:30 + "01:00" → T7 01:00      (đã qua rồi, nên là hôm nay)
//     T7 00:30 + "23:50" → T6 23:50
//
// Nó ăn khớp sẵn với mốc cắt ngày 04:00 của `logicalDate()`: T7 01:00 vẫn thuộc
// ngày logic T6, nên "đêm qua" ra đúng đêm qua mà ở đây không cần biết gì về
// mốc cắt đó.
//
// File thuần: không React, không Firestore, không DOM.
// ---------------------------------------------------------------------------
import { formatDuration } from '@/lib/datetime';

/** Chấp nhận "7:15" lẫn "07:15" - iOS trả về dạng có số 0, gõ tay thì không. */
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

export type ClockDir = 'past' | 'future';

/**
 * "07:15" → mốc epoch gần nhất theo hướng. Sai định dạng → `null`.
 *
 * Dời ngày bằng `setDate()` chứ không phải cộng trừ 24 tiếng: đúng ở nơi có
 * giờ mùa hè. Việt Nam thì không có, nhưng một hàm giờ giấc sai theo múi giờ
 * là loại lỗi không ai tìm ra được về sau.
 */
export function resolveClockTime(hhmm: string, now: number, dir: ClockDir): number | null {
  const m = CLOCK_RE.exec(hhmm.trim());
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;

  const d = new Date(now);
  d.setHours(h, min, 0, 0);

  // Đúng bằng `now` thì để yên: đó là "bây giờ", không phải hôm qua.
  if (dir === 'past' && d.getTime() > now) d.setDate(d.getDate() - 1);
  if (dir === 'future' && d.getTime() <= now) d.setDate(d.getDate() + 1);

  return d.getTime();
}

/** ts → "07:15" (24h, đúng thứ `<input type="time">` nhận và trả về). */
export function toClockInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * "15m ago" / "in 30m" / "just now".
 *
 * Dưới một phút thì không nói con số: "0m ago" đọc lên như thể có gì sai.
 */
export function relativeLabel(ts: number, now: number): string {
  const diff = ts - now;
  if (Math.abs(diff) < 60_000) return 'just now';
  return diff < 0 ? `${formatDuration(-diff)} ago` : `in ${formatDuration(diff)}`;
}
