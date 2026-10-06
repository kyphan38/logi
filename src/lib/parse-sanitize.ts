// ============================================================
// logi - Filtering Gemini output before it goes to the client.
// An LLM can make things up: unknown categories, dates in 1970, 40h sessions,
// or ids that do not exist. The client trusts the server, so the server must be clean.
// Pure logic, no Firestore → testable with node --test.
// ============================================================

import { CATEGORIES, MAX_SESSION_MIN, type Category } from '@/types/logi';
import type { ParseResult } from '@/lib/gemini-parse';

export type Intent = ParseResult['intent'];

/** Like ParseResult, but times are epoch ms so the client does not parse ISO again. */
export interface ParsedCommand {
  intent: Intent;
  category: Category | null;
  label: string | null;
  startAt: number | null;
  endAt: number | null;
  /** Bedtime, epoch ms. Only meaningful when intent = bedtime - never becomes an activity. */
  bedtimeAt: number | null;
  confidence: number;
  clarifyQuestion: string | null;
  clarifyOptions: string[] | null;
  targetActivityId: string | null;
  transcript: string;
}

const INTENTS: readonly Intent[] = [
  'start',
  'stop',
  'log_past',
  'schedule',
  'edit',
  'bedtime',
  'clarify',
  'unknown',
];

const MAX_TEXT = 200;
const HOUR = 3_600_000;
/** Matches `MAX_BACKDATE_MS` in activities.ts - over 7 days, validateTimes blocks it too. */
const MAX_BACKDATE_MS = 7 * 24 * HOUR;
const MAX_FUTURE_MS = 24 * HOUR;
const MAX_SPAN_MS = MAX_SESSION_MIN * 60_000; // 15h

function clip(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_TEXT) : null;
}

/** ISO string → epoch ms. Junk gives null. */
function toMs(v: unknown): number | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export function sanitizeParse(
  raw: Partial<ParseResult> | null | undefined,
  opts: { now: number; knownIds: ReadonlySet<string> },
): ParsedCommand {
  const r = raw ?? {};
  const { now, knownIds } = opts;

  let intent: Intent = INTENTS.includes(r.intent as Intent) ? (r.intent as Intent) : 'unknown';
  let question = clip(r.clarifyQuestion);

  /** Push to clarify: never save suspicious data on its own, ask the user. */
  function askBack(q: string) {
    intent = 'clarify';
    question = question ?? q;
  }

  // --- category ---------------------------------------------------
  // null is valid ("stop" needs no category). Only an unknown word needs asking back.
  let category: Category | null = null;
  if (r.category != null) {
    if ((CATEGORIES as readonly string[]).includes(r.category)) {
      category = r.category as Category;
    } else {
      askBack('Which category was that?');
    }
  }

  // --- times ------------------------------------------------------
  const startAt = toMs(r.startAt);
  let endAt = toMs(r.endAt);
  // The bedtime mark: only read for the bedtime intent. In other sentences a
  // time is a session time, not a bedtime - never guess for the user.
  const bedtimeAt = intent === 'bedtime' ? toMs(r.bedtimeAt) : null;

  if (startAt !== null) {
    if (now - startAt > MAX_BACKDATE_MS) askBack('That looks more than 7 days ago. Is that right?');
    if (startAt - now > MAX_FUTURE_MS) askBack('That start time is far in the future. Is that right?');
  }
  // The user DID give an end time, but it makes no sense. Very different from
  // giving no end time - see the safety net just below.
  let badEndDropped = false;

  if (startAt !== null && endAt !== null) {
    if (endAt <= startAt) {
      endAt = null; // a nonsense end time → drop it, let the user fill it in
      badEndDropped = true;
    } else if (endAt - startAt > MAX_SPAN_MS) {
      askBack('That session is longer than 15 hours. Is that right?');
    }
  }

  // --- Started in the past, STILL RUNNING ----
  // "I started watching YouTube 30 minutes ago and haven't finished yet".
  // Seeing a past time, the model tends to pick log_past, which requires an
  // endAt, so the card asks for an end time that does not exist.
  // This is only a safety net; the real fix lives in buildSystemPrompt().
  if (intent === 'log_past' && endAt === null && !badEndDropped) {
    intent = 'start';
  }
  // "until now" means STILL RUNNING, not an end time.
  // Running means no endAt - the two cannot go together.
  if (intent === 'start' && endAt !== null) {
    endAt = null;
  }

  // --- confidence --------------------------------------------------
  const c = typeof r.confidence === 'number' ? r.confidence : NaN;
  const confidence = Number.isFinite(c) && c >= 0 && c <= 1 ? c : 0;

  // --- target ------------------------------------------------------
  // Only accept ids really in the list just read, to avoid editing the wrong record.
  const target = typeof r.targetActivityId === 'string' ? r.targetActivityId : null;
  const targetActivityId = target && knownIds.has(target) ? target : null;

  // --- options -----------------------------------------------------
  const opts2 = Array.isArray(r.clarifyOptions)
    ? r.clarifyOptions.map(clip).filter((s): s is string => s !== null).slice(0, 5)
    : [];

  // Bedtime is not a session: no category, no label, no start/end.
  // Keep exactly one mark so the write layer can never create a stray activity.
  if (intent === 'bedtime') {
    category = null;
    return {
      intent,
      category,
      label: null,
      startAt: null,
      endAt: null,
      bedtimeAt,
      confidence,
      clarifyQuestion: question,
      clarifyOptions: opts2.length ? opts2 : null,
      targetActivityId,
      transcript: clip(r.transcript) ?? '',
    };
  }

  return {
    intent,
    category,
    label: clip(r.label),
    startAt,
    endAt,
    bedtimeAt: null,
    confidence,
    clarifyQuestion: intent === 'clarify' ? (question ?? 'Sorry, what was that?') : question,
    clarifyOptions: opts2.length ? opts2 : null,
    targetActivityId,
    transcript: clip(r.transcript) ?? '',
  };
}
