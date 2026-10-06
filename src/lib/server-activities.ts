import 'server-only';

// ============================================================
// logi - Reads activities with the Admin SDK, only to build prompt context.
// READ ONLY. Every write still goes through src/lib/activities.ts on the
// client, where validateTimes / derive / assertCategory live.
// ============================================================

import { adminDb } from '@/lib/firebase-admin';
import type { Activity } from '@/types/logi';

/** Enough for buildSystemPrompt, without pulling whole documents. */
export type PromptActivity = Pick<Activity, 'id' | 'category' | 'label' | 'startAt' | 'endAt'>;

function col(uid: string) {
  return adminDb.collection('users').doc(uid).collection('activities');
}

function toPromptActivity(
  d: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): PromptActivity {
  const data = d.data();
  return {
    id: d.id,
    category: data.category as Activity['category'],
    label: (data.label as string | null) ?? null,
    startAt: data.startAt as number,
    endAt: (data.endAt as number | null) ?? null,
  };
}

/** Running sessions. */
export async function listActiveForPrompt(uid: string): Promise<PromptActivity[]> {
  const snap = await col(uid).where('status', '==', 'active').orderBy('startAt', 'asc').get();
  return snap.docs.map(toPromptActivity);
}

/** A few recent records - so Gemini understands "the same as before", "that one". */
export async function listRecentForPrompt(uid: string, n = 5): Promise<PromptActivity[]> {
  const snap = await col(uid)
    .where('status', 'in', ['done', 'active'])
    .orderBy('startAt', 'desc')
    .limit(n)
    .get();
  return snap.docs.map(toPromptActivity);
}
