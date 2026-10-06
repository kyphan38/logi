// ---------------------------------------------------------------------------
// logi - Helpers for <input type="datetime-local"> and duration display
// ---------------------------------------------------------------------------

/** ts → "YYYY-MM-DDTHH:mm" (local time, exactly what datetime-local needs). */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → ts. Empty or invalid → null. */
export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ts = new Date(v).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Round down to the nearest multiple of minutes (default 15). */
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

/** ts → "7:15 AM" in the device locale. The time label on Now cards. */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** ts → "Aug 25" - for the day-change toast. */
export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * ms left → "4:32", or "1:04:32" past an hour. For a scheduled session's
 * countdown.
 *
 * Rounds UP: with 4.2 seconds left it shows "0:05" before reaching 0, rather
 * than jumping to 0:04 the moment it appears.
 */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
