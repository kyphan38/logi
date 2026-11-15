// Gemini out of credit (402) or rate limited (429): say so instead of a generic error.
// gemini-parse.ts and gemini-insight.ts throw `Gemini <status>...` on a bad response.

export const QUOTA_MESSAGE = 'AI credit is used up. Top it up in AI Studio, then try again.';

export function isQuotaError(e: unknown): boolean {
  return e instanceof Error && /^Gemini (402|429)\b/.test(e.message);
}
