// ---------------------------------------------------------------------------
// logi - Helper cho <input type="datetime-local"> và hiển thị thời lượng
// ---------------------------------------------------------------------------

/** ts → "YYYY-MM-DDTHH:mm" (giờ địa phương, đúng thứ input datetime-local cần). */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → ts. Chuỗi rỗng hoặc sai → null. */
export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ts = new Date(v).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Làm tròn xuống bội số phút gần nhất (mặc định 15). */
export function roundDown(ts: number, minutes = 15): number {
  const step = minutes * 60_000;
  return Math.floor(ts / step) * step;
}

/** ms → "3h 0m" / "45m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** ts → "7:15 AM" theo locale máy. Nhãn giờ trên card ở màn Now. */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** ts → "Aug 25" - dùng cho toast đổi ngày. */
export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * ms còn lại → "4:32", hoặc "1:04:32" khi hơn một giờ. Dùng cho đếm ngược
 * session đã hẹn giờ.
 *
 * Làm tròn LÊN: còn 4.2 giây thì hiện "0:05" rồi mới về 0, chứ không nhảy sang
 * 0:04 ngay lúc vừa hiện ra.
 */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
