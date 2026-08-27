// ---------------------------------------------------------------------------
// logi — Helper cho <input type="datetime-local"> và hiển thị thời lượng
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

/** ts → "Aug 25" — dùng cho toast đổi ngày. */
export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
