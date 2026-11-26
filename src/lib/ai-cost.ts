/**
 * Cost of Gemini calls, kept per month in the `aiUsage/{YYYY-MM}` doc.
 * Pure: no Firebase, no React. The same file is copied into every ws/app app
 * that calls Gemini, so keep the copies equal.
 * Prices: ai.google.dev/pricing (USD per 1M tokens; thinking bills as output).
 * Search grounding fees are not counted.
 */

export interface UsageMeta {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

export type Price = { input: number; output: number };

export function pricePerMillion(model: string, now: number): Price {
  const m = model.toLowerCase();
  if (m.includes('embedding')) return { input: 0.15, output: 0 };
  if (m.includes('argon')) return now < Date.UTC(2026, 11, 1) ? { input: 2, output: 10 } : { input: 4, output: 20 };
  if (m.includes('hydrogen')) return { input: 1.5, output: 7.5 };
  // Flash, and the fallback for any model not listed above.
  return now < Date.UTC(2027, 0, 1) ? { input: 0.75, output: 3.75 } : { input: 1.5, output: 7.5 };
}

export function costUsd(model: string, meta: UsageMeta | undefined, now: number): number {
  const input = meta?.promptTokenCount ?? 0;
  const output = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
  const p = pricePerMillion(model, now);
  return (input * p.input + output * p.output) / 1_000_000;
}

/** Month id in Vietnam time (UTC+7, no DST), for example "2026-11". */
export function monthKey(now: number): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 7);
}
