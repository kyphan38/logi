import 'server-only';

// ============================================================
// POST /api/insight   (Stage 7 Task 3)
// Body: { from, to, digest, digestHash }
// Trả:  InsightResult đã sanitize
//
// Digest được tính ở client vì mọi mốc giờ (04:00 cắt ngày, 20:00 "làm khuya")
// phải theo múi giờ của máy người dùng. Server không tin nội dung đó cho việc
// gì khác ngoài việc gửi cho Gemini và đối chiếu ngược lại chính nó.
//
// Digest KHÔNG được log ra đâu cả — đây là dữ liệu sinh hoạt cá nhân.
// ============================================================

import { analyseDigest } from '@/lib/gemini-insight';
import { sanitizeInsight } from '@/lib/insight-sanitize';
import type { Digest } from '@/lib/digest';
import { requireSessionUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** Digest thật ~4KB. Lớn hơn nhiều lần nghĩa là có ai đó đang tuồn record thô. */
const MAX_DIGEST_CHARS = 24 * 1024;
const GEMINI_TIMEOUT_MS = 25_000;

// --- Rate limit: 10 request mỗi giờ -------------------------------
// Kết quả được cache theo digestHash ở client, nên dùng bình thường một ngày
// chỉ vài lần. Hạn này chỉ để chặn bấm liên tục.
const RL_WINDOW_MS = 60 * 60_000;
const RL_MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(uid: string, now: number): boolean {
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (recent.length >= RL_MAX) {
    hits.set(uid, recent);
    return true;
  }
  recent.push(now);
  hits.set(uid, recent);
  return false;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: Request): Promise<Response> {
  const now = Date.now();

  let uid: string;
  try {
    uid = (await requireSessionUser()).uid;
  } catch {
    return json(401, { error: 'Not signed in' });
  }

  if (rateLimited(uid, now)) {
    return json(429, { error: 'Analysed a lot already. Try again later.' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Bad JSON' });
  }

  const { from, to, digest, digestHash } = body;
  if (!isDate(from) || !isDate(to)) return json(400, { error: 'Bad range' });
  if (!digest || typeof digest !== 'object' || Array.isArray(digest)) {
    return json(400, { error: 'Bad digest' });
  }
  if (JSON.stringify(digest).length > MAX_DIGEST_CHARS) {
    return json(413, { error: 'Digest is too large.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/insight] Missing GEMINI_API_KEY');
    return json(500, { error: 'Insights are not configured.' });
  }

  let raw: unknown;
  try {
    raw = await withTimeout(analyseDigest(digest as Digest, apiKey), GEMINI_TIMEOUT_MS);
  } catch (e) {
    // Chỉ log tên lỗi, không log digest.
    console.error('[api/insight] gemini failed', e instanceof Error ? e.message : 'unknown');
    return json(502, { error: 'Could not analyse right now.' });
  }

  // Không có đường nào đi vòng qua bước này.
  const result = sanitizeInsight(raw, digest as Digest);

  return json(200, {
    ...result,
    from,
    to,
    digestHash: typeof digestHash === 'string' ? digestHash : '',
    generatedAt: now,
  });
}
