// ============================================================
// logi - Lọc kết quả Gemini trước khi trả cho client.
// LLM có thể bịa: category lạ, ngày năm 1970, session dài 40h,
// hay id không tồn tại. Client tin server, nên server phải sạch.
// Thuần logic, không chạm Firestore → test được bằng node --test.
// ============================================================

import { CATEGORIES, MAX_SESSION_MIN, type Category } from '@/types/logi';
import type { ParseResult } from '@/lib/gemini-parse';

export type Intent = ParseResult['intent'];

/** Giống ParseResult, nhưng mốc thời gian là epoch ms cho client khỏi parse ISO lần nữa. */
export interface ParsedCommand {
  intent: Intent;
  category: Category | null;
  label: string | null;
  startAt: number | null;
  endAt: number | null;
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
  'clarify',
  'unknown',
];

const MAX_TEXT = 200;
const HOUR = 3_600_000;
/** Khớp `MAX_BACKDATE_MS` trong activities.ts - quá 7 ngày thì validateTimes cũng chặn. */
const MAX_BACKDATE_MS = 7 * 24 * HOUR;
const MAX_FUTURE_MS = 24 * HOUR;
const MAX_SPAN_MS = MAX_SESSION_MIN * 60_000; // 15h

function clip(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_TEXT) : null;
}

/** ISO string → epoch ms. Rác thì null. */
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

  /** Đẩy về clarify: không tự ý ghi khi dữ liệu đáng ngờ, hỏi lại người dùng. */
  function askBack(q: string) {
    intent = 'clarify';
    question = question ?? q;
  }

  // --- category ---------------------------------------------------
  // null là hợp lệ (câu "stop" không cần category). Chỉ chữ lạ mới phải hỏi lại.
  let category: Category | null = null;
  if (r.category != null) {
    if ((CATEGORIES as readonly string[]).includes(r.category)) {
      category = r.category as Category;
    } else {
      askBack('Which category was that?');
    }
  }

  // --- mốc thời gian ----------------------------------------------
  const startAt = toMs(r.startAt);
  let endAt = toMs(r.endAt);

  if (startAt !== null) {
    if (now - startAt > MAX_BACKDATE_MS) askBack('That looks more than 7 days ago. Is that right?');
    if (startAt - now > MAX_FUTURE_MS) askBack('That start time is far in the future. Is that right?');
  }
  if (startAt !== null && endAt !== null) {
    if (endAt <= startAt) {
      endAt = null; // giờ kết thúc vô lý → bỏ, để người dùng tự điền
    } else if (endAt - startAt > MAX_SPAN_MS) {
      askBack('That session is longer than 15 hours. Is that right?');
    }
  }

  // --- confidence --------------------------------------------------
  const c = typeof r.confidence === 'number' ? r.confidence : NaN;
  const confidence = Number.isFinite(c) && c >= 0 && c <= 1 ? c : 0;

  // --- target ------------------------------------------------------
  // Chỉ nhận id có thật trong danh sách vừa đọc, tránh sửa nhầm record khác.
  const target = typeof r.targetActivityId === 'string' ? r.targetActivityId : null;
  const targetActivityId = target && knownIds.has(target) ? target : null;

  // --- options -----------------------------------------------------
  const opts2 = Array.isArray(r.clarifyOptions)
    ? r.clarifyOptions.map(clip).filter((s): s is string => s !== null).slice(0, 5)
    : [];

  return {
    intent,
    category,
    label: clip(r.label),
    startAt,
    endAt,
    confidence,
    clarifyQuestion: intent === 'clarify' ? (question ?? 'Sorry, what was that?') : question,
    clarifyOptions: opts2.length ? opts2 : null,
    targetActivityId,
    transcript: clip(r.transcript) ?? '',
  };
}
