// Start from a link (G4): /now?start=learn&label=gym starts a session at once.
// Pure: no React, no Firebase.

import { CATEGORIES, type Category } from '@/types/logi';

export type StartLink = { category: Category; label: string | null };

/** Reads `?start=` and `&label=` from a query string. Null when there is no valid start. */
export function parseStartLink(search: string): StartLink | null {
  const params = new URLSearchParams(search);
  const raw = (params.get('start') ?? '').trim().toLowerCase();
  const category = CATEGORIES.find((c) => c === raw);
  if (!category) return null;
  const label = (params.get('label') ?? '').normalize('NFC').trim().slice(0, 80);
  return { category, label: label || null };
}

/** The 4 links shown in the Guide and Settings, one per category. */
export function startLinks(origin: string): { category: Category; url: string }[] {
  return CATEGORIES.map((category) => ({ category, url: `${origin}/now?start=${category}` }));
}
