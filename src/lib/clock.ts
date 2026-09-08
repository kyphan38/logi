// ---------------------------------------------------------------------------
// logi - Đọc một chuỗi giờ "HH:MM" thành mốc epoch
//
// Người dùng gõ giờ, gần như không bao giờ gõ ngày. Khi KHÔNG biết ngày, nó
// được suy ra bằng một luật duy nhất, dùng chung cho cả sheet "khi nào bắt đầu"
// lẫn sheet bedtime bên Now:
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
// Chỗ ĐÃ biết ngày rồi thì dùng `resolveClockOnDate()`: bên History người dùng
// chọn ngày trước rồi mới gõ giờ, nên luật "gần nhất trong quá khứ" vừa thừa
// vừa sai - nó không với xa quá 24 tiếng.
//
// File thuần: không React, không Firestore, không DOM.
// ---------------------------------------------------------------------------
import { formatDuration } from '@/lib/datetime';
import { DAY_CUTOFF_HOUR } from '@/types/logi';

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
  const c = parseClock(hhmm);
  if (!c) return null;

  const d = new Date(now);
  d.setHours(c.h, c.min, 0, 0);

  // Đúng bằng `now` thì để yên: đó là "bây giờ", không phải hôm qua.
  if (dir === 'past' && d.getTime() > now) d.setDate(d.getDate() - 1);
  if (dir === 'future' && d.getTime() <= now) d.setDate(d.getDate() + 1);

  return d.getTime();
}

/** "07:15" → `{ h: 7, min: 15 }`. Sai định dạng hoặc quá biên → `null`. */
function parseClock(hhmm: string): { h: number; min: number } | null {
  const m = CLOCK_RE.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "23:30" + ngày logic '2026-09-05' → mốc epoch nằm ĐÚNG trong đêm hôm đó.
 *
 * Khác `resolveClockTime`: ở đây ngày là dữ liệu vào, không phải thứ phải đoán.
 * Nhờ vậy sửa được mốc của một đêm bất kỳ, không riêng hai đêm gần nhất.
 *
 * Ngày logic D chạy từ D 04:00 tới D+1 04:00, nên giờ TRƯỚC 04:00 rơi vào ngày
 * lịch KẾ TIẾP: 01:00 của "đêm thứ Sáu" là 01:00 rạng sáng thứ Bảy. Bỏ bước
 * này thì mốc lùi hẳn một ngày, đúng loại lỗi không ai soi ra khi đọc lại.
 */
export function resolveClockOnDate(hhmm: string, date: string): number | null {
  const c = parseClock(hhmm);
  if (!c) return null;

  const dm = DATE_RE.exec(date.trim());
  if (!dm) return null;

  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);

  // Ngày không có thật ('2026-09-31', '2026-02-30') phải bị chặn ở đây: để lọt
  // thì `Date` lặng lẽ đẩy sang tháng sau và mốc ghi vào một đêm không ai chọn.
  const base = new Date(y, mo - 1, d, c.h, c.min, 0, 0);
  if (base.getMonth() !== mo - 1 || base.getDate() !== d) return null;

  // Dời ngày bằng `setDate` (ngày 31 tự tràn sang tháng sau) chứ không cộng 24
  // tiếng - đúng ở cả nơi có giờ mùa hè.
  if (c.h < DAY_CUTOFF_HOUR) base.setDate(base.getDate() + 1);

  const ts = base.getTime();
  return Number.isNaN(ts) ? null : ts;
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
