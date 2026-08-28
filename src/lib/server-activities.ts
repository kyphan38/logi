import 'server-only';

// ============================================================
// logi - Đọc activity bằng Admin SDK, chỉ để dựng context cho prompt.
// CHỈ ĐỌC. Mọi đường ghi vẫn đi qua src/lib/activities.ts ở client,
// nơi có validateTimes / derive / assertCategory.
// ============================================================

import { adminDb } from '@/lib/firebase-admin';
import type { Activity } from '@/types/logi';

/** Đủ dùng cho buildSystemPrompt, không kéo cả document cho tốn. */
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

/** Session đang chạy. */
export async function listActiveForPrompt(uid: string): Promise<PromptActivity[]> {
  const snap = await col(uid).where('status', '==', 'active').orderBy('startAt', 'asc').get();
  return snap.docs.map(toPromptActivity);
}

/** Vài record gần nhất - để Gemini hiểu "the same as before", "that one". */
export async function listRecentForPrompt(uid: string, n = 5): Promise<PromptActivity[]> {
  const snap = await col(uid)
    .where('status', 'in', ['done', 'active'])
    .orderBy('startAt', 'desc')
    .limit(n)
    .get();
  return snap.docs.map(toPromptActivity);
}
