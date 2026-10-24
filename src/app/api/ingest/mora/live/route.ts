import 'server-only';

// ============================================================
// POST /api/ingest/mora/live
// mora's Cloud Function reports focus runs as they happen:
//   { action: 'start', runId, kind, label, startAt }  -> a running activity
//   { action: 'stop', runId, endAt }                  -> finished (or removed if < 1 min)
// Same token as /api/ingest/mora. Server to server, so no CORS.
// ============================================================

import { adminDb } from '@/lib/firebase-admin';
import { ownerUid, tokenOk } from '@/lib/mora-auth';
import { docId, planStop, readLiveRequest, startDoc } from '@/lib/mora-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const expected = process.env.MORA_INGEST_TOKEN;
  if (!expected) return Response.json({ error: 'not-configured' }, { status: 503 });
  if (!tokenOk(req.headers.get('authorization'), expected)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const now = Date.now();
  let r;
  try {
    r = readLiveRequest(await req.json(), now);
  } catch (e) {
    const reason = e instanceof Error ? ((e as { code?: string }).code ?? e.message) : 'bad-request';
    return Response.json({ error: reason }, { status: 400 });
  }

  const ref = adminDb.collection('users').doc(await ownerUid()).collection('activities').doc(docId(r.runId));

  if (r.action === 'start') {
    try {
      await ref.create(startDoc(r, now));
    } catch (e) {
      // Already started (a retry): fine.
      if ((e as { code?: number }).code !== 6) throw e;
    }
    return Response.json({ ok: true });
  }

  const plan = planStop((await ref.get()).data(), r.endAt, now);
  if (plan.kind === 'delete') await ref.delete();
  if (plan.kind === 'finish') await ref.update(plan.patch);
  return Response.json({ ok: true, result: plan.kind });
}
