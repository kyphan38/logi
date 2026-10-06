import 'server-only';

// ============================================================
// POST /api/parse
// Body: { audio?: base64, mimeType?: string, text?: string, requestId: string }
// Returns: ParsedCommand (sanitized, times as epoch ms)
// ============================================================

import { buildSystemPrompt, parseAudio, parseTextCorrection } from '@/lib/gemini-parse';
import { sanitizeParse, type ParsedCommand } from '@/lib/parse-sanitize';
import { requireSessionUser } from '@/lib/server-auth';
import { listActiveForPrompt, listRecentForPrompt } from '@/lib/server-activities';
import { TIMEZONE } from '@/types/logi';

export const runtime = 'nodejs'; // firebase-admin does not run on the edge
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** 6MB base64 ≈ 4.5MB audio. The mic button cuts at 30s, so usually only a few hundred KB. */
const MAX_AUDIO_B64 = 6 * 1024 * 1024;
const MAX_TEXT_LEN = 1000;
/** Give up before the 30s maxDuration, to still return a proper error. */
const GEMINI_TIMEOUT_MS = 25_000;

// --- Rate limit ---------------------------------------------------
// A module-scope Map: enough for a one-user app. A serverless reset is fine;
// the goal is only to stop an error loop from burning the Gemini quota.
const RL_WINDOW_MS = 5 * 60_000;
const RL_MAX = 30;
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

/** Vietnam has no DST, so the offset is always +07:00. */
function nowISOInTz(now: number): string {
  return new Date(now + 7 * 3_600_000).toISOString().replace('Z', '+07:00');
}

function weekdayInTz(now: number): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TIMEZONE }).format(now);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

export async function POST(req: Request): Promise<Response> {
  const now = Date.now();

  let uid: string;
  try {
    uid = (await requireSessionUser()).uid;
  } catch {
    return json(401, { error: 'Not signed in' });
  }

  if (rateLimited(uid, now)) {
    return json(429, { error: 'Too many requests. Wait a minute.' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Bad JSON' });
  }

  const audio = str(body.audio);
  const text = str(body.text);
  const mimeType = str(body.mimeType) ?? 'audio/mp4';
  const requestId = str(body.requestId) ?? '';

  if (audio && audio.length > MAX_AUDIO_B64) {
    return json(413, { error: 'Recording is too long.' });
  }
  if (!audio && !text) {
    return json(400, { error: 'Send audio or text.' });
  }
  if (text && text.length > MAX_TEXT_LEN) {
    return json(413, { error: 'Text is too long.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/parse] Missing GEMINI_API_KEY');
    return json(500, { error: 'Voice is not configured.' });
  }

  // Context helps Gemini understand "stop that" / "same as before".
  // If Firestore fails, parse anyway with empty context - never lose what was said.
  let active: Awaited<ReturnType<typeof listActiveForPrompt>> = [];
  let recent: Awaited<ReturnType<typeof listRecentForPrompt>> = [];
  try {
    [active, recent] = await Promise.all([listActiveForPrompt(uid), listRecentForPrompt(uid, 5)]);
  } catch (e) {
    console.error('[api/parse] context read failed', e);
  }

  const systemPrompt = buildSystemPrompt({
    nowISO: nowISOInTz(now),
    weekday: weekdayInTz(now),
    activeActivities: active,
    recentActivities: recent,
  });

  let raw;
  try {
    raw = await withTimeout(
      audio
        ? parseAudio(audio, mimeType, systemPrompt, apiKey)
        : parseTextCorrection(text as string, systemPrompt, apiKey),
      GEMINI_TIMEOUT_MS,
    );
  } catch (e) {
    console.error('[api/parse] gemini failed', e);
    return json(502, { error: 'Could not understand that' });
  }

  const knownIds = new Set([...active, ...recent].map((a) => a.id));
  const command: ParsedCommand = sanitizeParse(raw, { now, knownIds });

  return json(200, { ...command, requestId });
}
