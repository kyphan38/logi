import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { costUsd, monthKey, type UsageMeta } from '@/lib/ai-cost';
import { adminDb } from '@/lib/firebase-admin';

/**
 * Adds one Gemini call's cost to aiUsage/{YYYY-MM}, which Settings shows.
 * Never throws: a failed log must not fail the AI answer.
 */
export async function logAiCost(model: string, meta: UsageMeta | undefined): Promise<void> {
  const now = Date.now();
  const usd = costUsd(model, meta, now);
  if (!(usd > 0)) return;
  try {
    await adminDb
      .doc(`aiUsage/${monthKey(now)}`)
      .set({ usd: FieldValue.increment(usd), calls: FieldValue.increment(1), updatedAt: now }, { merge: true });
  } catch (err) {
    console.warn('[ai-cost] log failed', err instanceof Error ? err.message : err);
  }
}
