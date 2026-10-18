// ============================================================
// logi - Focus blocks sent by mora (the focus timer app).
// Pure: checks the request body and builds the records. The route
// (src/app/api/ingest/mora) does auth and the Firestore writes.
//
// Each block becomes one finished activity with doc id `mora_<id>`, so a
// resend after a network error never makes a second record.
// ============================================================

import { ActivityError, assertCategory, deriveInZone, validateTimes } from '@/lib/activity-rules';
import { TIMEZONE, type Category } from '@/types/logi';

export const MAX_BLOCKS = 50;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MORA_KINDS: Category[] = ['learn', 'work'];

export interface MoraBlock {
  id: string;
  kind: Category;
  label: string;
  startAt: number;
  endAt: number;
}

export interface MoraRecord {
  docId: string;
  data: Record<string, unknown>;
}

export type Checked =
  | { ok: true; id: string; record: MoraRecord }
  | { ok: false; id: string; reason: string };

/** Reads the body. Throws on a malformed request; bad single blocks are returned as rejected. */
export function readBlocks(body: unknown): unknown[] {
  const blocks = (body as { blocks?: unknown })?.blocks;
  if (!Array.isArray(blocks)) throw new Error('blocks must be an array');
  if (blocks.length > MAX_BLOCKS) throw new Error(`at most ${MAX_BLOCKS} blocks`);
  return blocks;
}

export function checkBlock(raw: unknown, now: number = Date.now()): Checked {
  const b = raw as Partial<MoraBlock> | null;
  const id = typeof b?.id === 'string' ? b.id : '';
  if (!ID_RE.test(id)) return { ok: false, id, reason: 'bad-id' };
  if (!b || typeof b.startAt !== 'number' || typeof b.endAt !== 'number') return { ok: false, id, reason: 'bad-times' };
  const kind = b.kind ?? 'learn';
  if (!MORA_KINDS.includes(kind as Category)) return { ok: false, id, reason: 'bad-category' };
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 120) : '';
  try {
    assertCategory(kind);
    validateTimes(b.startAt, b.endAt, 'done', now);
  } catch (e) {
    return { ok: false, id, reason: e instanceof ActivityError ? e.code : 'invalid' };
  }
  return {
    ok: true,
    id,
    record: {
      docId: `mora_${id}`,
      data: {
        category: kind,
        label: label || null,
        startAt: b.startAt,
        endAt: b.endAt,
        ...deriveInZone(b.startAt, b.endAt, TIMEZONE),
        status: 'done',
        source: 'mora',
        confidence: null,
        rawText: null,
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}
