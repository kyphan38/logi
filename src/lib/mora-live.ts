// ============================================================
// logi - Live focus runs from mora (start / stop / cancel).
// Pure: checks the request and builds the Firestore changes. The route
// (src/app/api/ingest/mora/live) does auth and the writes.
//
// One run = the time between Play and Pause/Stop in mora. Doc id
// `mora_<runId>`; every call is safe to repeat.
// ============================================================

import { ActivityError, deriveInZone, validateTimes } from '@/lib/activity-rules';
import { CATEGORIES, TIMEZONE, type Category } from '@/types/logi';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Runs shorter than this are removed instead of kept: a quick pause is not worth a record. */
export const MIN_RUN_MS = 60_000;

export type LiveRequest =
  | { action: 'start'; runId: string; kind: Category; label: string | null; startAt: number }
  | { action: 'stop'; runId: string; endAt: number };

export function docId(runId: string): string {
  return `mora_${runId}`;
}

/** Throws ActivityError or Error with a short reason on a bad request. */
export function readLiveRequest(body: unknown, now: number = Date.now()): LiveRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const runId = typeof b.runId === 'string' ? b.runId : '';
  if (!ID_RE.test(runId)) throw new Error('bad-id');
  if (b.action === 'start') {
    // mora's own tasks are learn or work; routine items started in mora keep their category.
    const kind = b.kind === undefined ? 'learn' : (CATEGORIES as readonly unknown[]).includes(b.kind) ? (b.kind as Category) : null;
    if (!kind) throw new Error('bad-category');
    if (typeof b.startAt !== 'number') throw new Error('bad-times');
    validateTimes(b.startAt, null, 'active', now);
    const label = typeof b.label === 'string' ? b.label.trim().slice(0, 120) || null : null;
    return { action: 'start', runId, kind, label, startAt: b.startAt };
  }
  if (b.action === 'stop') {
    if (typeof b.endAt !== 'number') throw new Error('bad-times');
    return { action: 'stop', runId, endAt: b.endAt };
  }
  throw new Error('bad-action');
}

/** The new running record for a start. */
export function startDoc(r: Extract<LiveRequest, { action: 'start' }>, now: number) {
  return {
    category: r.kind,
    label: r.label,
    startAt: r.startAt,
    endAt: null,
    ...deriveInZone(r.startAt, null, TIMEZONE),
    status: 'active',
    source: 'mora',
    confidence: null,
    rawText: null,
    createdAt: now,
    updatedAt: now,
  };
}

export type StopPlan = { kind: 'ignore' } | { kind: 'delete' } | { kind: 'finish'; patch: Record<string, unknown> };

/**
 * What a stop does to the stored record: nothing if it is gone or already
 * finished, delete a run under a minute, otherwise finish it. `stoppedBy`
 * tells logi's own trigger that mora caused this stop (no echo back).
 */
export function planStop(existing: { status?: unknown; startAt?: unknown } | undefined, endAt: number, now: number): StopPlan {
  if (!existing || existing.status !== 'active' || typeof existing.startAt !== 'number') return { kind: 'ignore' };
  const startAt = existing.startAt;
  const end = Math.max(endAt, startAt);
  if (end - startAt < MIN_RUN_MS) return { kind: 'delete' };
  try {
    validateTimes(startAt, end, 'done', now);
  } catch (e) {
    if (e instanceof ActivityError && e.code === 'too-long') {
      // Capped by the 15 h rule; keep the record rather than lose it.
      return finish(startAt, startAt + 15 * 3600_000, now);
    }
    throw e;
  }
  return finish(startAt, end, now);
}

function finish(startAt: number, endAt: number, now: number): StopPlan {
  return {
    kind: 'finish',
    patch: { endAt, status: 'done', ...deriveInZone(startAt, endAt, TIMEZONE), stoppedBy: 'mora', updatedAt: now },
  };
}
