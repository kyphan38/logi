import 'server-only';

// ============================================================
// POST /api/ingest/mora/routine
// mora's Cloud Function reads today's routine and ticks items done there:
//   { action: 'get' }                          -> today's list
//   { action: 'tick', date, itemId, on }       -> tick or untick, then today's list
// Same token as /api/ingest/mora/live. Server to server, so no CORS.
// ============================================================

import { FieldValue } from 'firebase-admin/firestore';

import { logicalDateInZone } from '@/lib/activity-rules';
import { adminDb } from '@/lib/firebase-admin';
import { ownerUid, tokenOk } from '@/lib/mora-auth';
import { readRoutineRequest, routineSnapshot } from '@/lib/mora-routine';
import { cleanItem } from '@/lib/routine';
import { TIMEZONE, type RoutineChecks, type RoutineGroup, type RoutineItem } from '@/types/logi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readGroups(uid: string): Promise<RoutineGroup[]> {
  const snap = await adminDb.collection('users').doc(uid).collection('routines').orderBy('order', 'asc').get();
  const groups: RoutineGroup[] = [];
  for (const d of snap.docs) {
    const g = d.data();
    if (g.archivedAt) continue;
    const items: RoutineItem[] = [];
    for (const r of Array.isArray(g.items) ? g.items : []) {
      if (typeof r?.id !== 'string' || typeof r?.text !== 'string') continue;
      items.push(cleanItem({ id: r.id, text: r.text, days: Array.isArray(r.days) ? r.days : [], minutes: r.minutes, category: r.category }));
    }
    groups.push({ id: d.id, title: String(g.title ?? ''), order: Number(g.order ?? 0), items, archivedAt: null, createdAt: 0, updatedAt: 0 });
  }
  return groups;
}

async function readChecks(uid: string, date: string): Promise<RoutineChecks> {
  const snap = await adminDb.collection('users').doc(uid).collection('routineChecks').doc(date).get();
  const checked: Record<string, number> = {};
  const raw = snap.data()?.checked;
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') checked[k] = v;
  return { date, checked };
}

export async function POST(req: Request) {
  const expected = process.env.MORA_INGEST_TOKEN;
  if (!expected) return Response.json({ error: 'not-configured' }, { status: 503 });
  if (!tokenOk(req.headers.get('authorization'), expected)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let r;
  try {
    r = readRoutineRequest(await req.json());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad-request' }, { status: 400 });
  }

  const uid = await ownerUid();
  const today = logicalDateInZone(Date.now(), TIMEZONE);
  const groups = await readGroups(uid);

  if (r.action === 'tick') {
    // A tick from yesterday's list would land on a day nobody looks at any more.
    if (r.date !== today) return Response.json({ error: 'old-day', snapshot: routineSnapshot(groups, await readChecks(uid, today), today) }, { status: 409 });
    const now = Date.now();
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('routineChecks')
      .doc(today)
      .set({ date: today, checked: { [r.itemId]: r.on ? now : FieldValue.delete() }, updatedAt: now }, { merge: true });
  }

  return Response.json({ ok: true, snapshot: routineSnapshot(groups, await readChecks(uid, today), today) });
}
