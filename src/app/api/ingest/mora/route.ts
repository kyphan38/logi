import 'server-only';

// ============================================================
// POST /api/ingest/mora
// mora (focus timer) sends finished focus blocks here.
// Auth: `Authorization: Bearer <MORA_INGEST_TOKEN>`. No token set on the
// server = the route is off (503). Writes go to the single allowed user.
// Body: { blocks: [{ id, kind: 'learn'|'work', label, startAt, endAt }] }
// Reply: { accepted: string[], rejected: { id, reason }[] }
// A block that already exists counts as accepted (resends are safe).
// ============================================================

import { timingSafeEqual } from 'node:crypto';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { checkBlock, readBlocks } from '@/lib/mora-ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// mora runs on its own domain, in the Tauri desktop window, and in dev.
const ORIGINS = new Set([
  'https://mora.kyphan38.com',
  'http://localhost:1420',
  'http://localhost:4173',
  'tauri://localhost',
  'http://tauri.localhost',
]);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  if (!ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown) {
  return Response.json(body, { status, headers: cors(req) });
}

function tokenOk(header: string | null, expected: string): boolean {
  const got = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

let cachedUid: string | null = null;
async function ownerUid(): Promise<string> {
  if (cachedUid) return cachedUid;
  const email = process.env.ALLOWED_USER_EMAIL;
  if (!email) throw new Error('ALLOWED_USER_EMAIL is not set');
  cachedUid = (await adminAuth.getUserByEmail(email)).uid;
  return cachedUid;
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const expected = process.env.MORA_INGEST_TOKEN;
  if (!expected) return json(req, 503, { error: 'not-configured' });
  if (!tokenOk(req.headers.get('authorization'), expected)) return json(req, 401, { error: 'unauthorized' });

  let raw: unknown[];
  try {
    raw = readBlocks(await req.json());
  } catch (e) {
    return json(req, 400, { error: e instanceof Error ? e.message : 'bad-request' });
  }

  const uid = await ownerUid();
  const col = adminDb.collection('users').doc(uid).collection('activities');
  const now = Date.now();
  const accepted: string[] = [];
  const rejected: { id: string; reason: string }[] = [];

  await Promise.all(
    raw.map(async (r) => {
      const c = checkBlock(r, now);
      if (!c.ok) {
        rejected.push({ id: c.id, reason: c.reason });
        return;
      }
      try {
        // create() fails if the doc exists: a resend, which is fine.
        await col.doc(c.record.docId).create(c.record.data);
        accepted.push(c.id);
      } catch (e) {
        if ((e as { code?: number }).code === 6) accepted.push(c.id); // ALREADY_EXISTS
        else rejected.push({ id: c.id, reason: 'write-failed' });
      }
    }),
  );

  return json(req, 200, { accepted, rejected });
}
