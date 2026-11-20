import { collection, getDocs } from 'firebase/firestore';

import type { MonthCost } from '@/lib/ai-cost';
import { db } from '@/lib/firebase-client';

/** Every month in aiUsage/{YYYY-MM} (one small doc a month). The server writes them. */
export async function loadAiCosts(): Promise<MonthCost[]> {
  const snap = await getDocs(collection(db, 'aiUsage'));
  return snap.docs.map((d) => ({ month: d.id, usd: Number(d.data().usd ?? 0) }));
}
