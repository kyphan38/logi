// ---------------------------------------------------------------------------
// logi - Filtering model output before it reaches the screen (Stage 7 Task 4 + 8)
//
// This is the main guard. The model writes fluently, so a made-up number looks
// exactly like a real one; the reader has no way to tell. So:
//
//   1. Every number in `body` must exist in the digest (tolerance 0.15)
//   2. Causal sentences → dropped. A week of data cannot prove A causes B
//   3. Medical, judging and sleep words → dropped
//   4. Over 4 notes → cut to 4. All dropped → a default sentence
//
// Pure: no network, no Firestore. Tested with `node --test`.
// ---------------------------------------------------------------------------
import type { Digest } from '@/lib/digest';
import { PRESETS, type PresetId } from '@/types/logi';

export type Severity = 'info' | 'notable' | 'important';

export interface Observation {
  title: string;
  body: string;
  /** The stat's name in the digest - tap to see the raw number. */
  metric: string;
  severity: Severity;
}

export interface InsightResult {
  observations: Observation[];
  suggestion: { text: string; preset: PresetId | null } | null;
  positive: string | null;
  /** Set when no notes remain after filtering. */
  note: string | null;
}

export const NOTHING_NOTABLE = 'Nothing notable in this period.';

export const MAX_OBSERVATIONS = 4;
/** Number match tolerance: 0.15 - enough for rounding, not for inventing. */
export const NUMBER_TOLERANCE = 0.15;

const MAX_TITLE = 80;
const MAX_BODY = 320;
const MAX_TEXT = 200;

// ---------------------------------------------------------------------------
// Banned words
// ---------------------------------------------------------------------------

/** Causal: may only say "goes with", never "because". */
const CAUSAL = [
  'because',
  'caused',
  'causes',
  'causing',
  'due to',
  'led to',
  'leads to',
  'resulted in',
  'results in',
  'as a result',
  'thanks to',
  'the reason',
];

/** Medical: this app diagnoses nothing. */
const MEDICAL = [
  'insomnia',
  'burnout',
  'burn-out',
  'burned out',
  'depression',
  'depressed',
  'disorder',
  'anxiety',
  'apnea',
  'diagnosis',
  'diagnose',
  'symptom',
  'symptoms',
  'sleep debt syndrome',
  'chronic',
];

/** Judgment: state numbers, do not lecture. */
const JUDGING = [
  'too much',
  'too little',
  'too many',
  'too few',
  'bad',
  'badly',
  'unhealthy',
  'should have',
  'you should',
  'you need to',
  'you must',
  'lazy',
  'poor',
  'terrible',
  'awful',
  'shame',
  'guilty',
];

/**
 * Sleep: the app does NOT track it (AMENDMENT-remove-sleep section 10).
 *
 * `dayShape` tells the model the last logged time of the day. Inferring
 * bedtime from it is very easy and always wrong - the user may read for two
 * hours after closing the app. The prompt forbids it; this is the second guard.
 */
const SLEEP_TALK = [
  'sleep',
  'sleeping',
  'slept',
  'asleep',
  'bedtime',
  'bed time',
  'wake-up',
  'wake up',
  'woke',
  'nap',
  'naps',
  'rested',
  'well-rested',
  'tired',
  'tiredness',
  'exhausted',
  'exhaustion',
  'fatigue',
  'fatigued',
  'overnight',
];

const BANNED = [...CAUSAL, ...MEDICAL, ...JUDGING, ...SLEEP_TALK];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED_RE = new RegExp(`\\b(${BANNED.map(escape).join('|')})\\b`, 'i');

/** A sentence with a banned word → drop the whole sentence, never patch it. Editing the model's text is more inventing. */
export function hasBannedWord(text: string): boolean {
  return BANNED_RE.test(text);
}

// ---------------------------------------------------------------------------
// Checking numbers against the digest
// ---------------------------------------------------------------------------

interface Allowed {
  numbers: number[];
  times: Set<string>;
}

/**
 * Times that come from DEFINITIONS, not data: the daily schedule in the system
 * prompt (04:30 wake, 20:30 study) and the marks a stat is named after
 * (`daysWithActivityAfter23`, `after22Hours`). Without them, a correct "four
 * days with activity after 23:00" would be wrongly dropped.
 */
export const ANCHOR_TIMES = [
  '04:00',
  '04:30',
  '06:00',
  '06:30',
  '07:00',
  '07:45',
  '08:00',
  '17:00',
  '18:00',
  '19:30',
  '20:00',
  '20:30',
  '22:00',
  '23:00',
];

function collect(v: unknown, out: Allowed): void {
  if (typeof v === 'number' && Number.isFinite(v)) {
    out.numbers.push(Math.abs(v));
    return;
  }
  if (typeof v === 'string') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (m) {
      out.times.add(`${m[1].padStart(2, '0')}:${m[2]}`);
      // "23:40" may also be written as 23 hours 40 minutes if the model splits it.
      out.numbers.push(Number(m[1]), Number(m[2]));
    }
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collect(x, out);
    return;
  }
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) collect(x, out);
  }
}

export function allowedValues(digest: Digest): Allowed {
  const out: Allowed = { numbers: [], times: new Set(ANCHOR_TIMES) };
  collect(digest, out);
  return out;
}

function known(n: number, allowed: Allowed): boolean {
  return allowed.numbers.some((v) => Math.abs(v - n) <= NUMBER_TOLERANCE);
}

/**
 * Every number in the sentence must trace back to the digest.
 * Accepts three forms: `23:40`, `1h20m`, and plain numbers (with `%`, also
 * compared as a fraction).
 */
export function numbersCheckOut(body: string, allowed: Allowed): boolean {
  let text = body;

  // 1. Clock times
  const times = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  for (const t of times) {
    const [h, m] = t.split(':');
    if (!allowed.times.has(`${h.padStart(2, '0')}:${m}`)) return false;
  }
  text = text.replace(/\b\d{1,2}:\d{2}\b/g, ' ');

  // 2. "1h20m" - accepted read as hours or as minutes
  const spans = [...text.matchAll(/\b(\d+)\s?h\s?(\d+)\s?m\b/gi)];
  for (const s of spans) {
    const h = Number(s[1]);
    const m = Number(s[2]);
    if (!known(h + m / 60, allowed) && !known(h * 60 + m, allowed)) return false;
  }
  text = text.replace(/\b(\d+)\s?h\s?(\d+)\s?m\b/gi, ' ');

  // 3. Remaining numbers
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(%?)/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return false;
    if (known(n, allowed)) continue;
    // "72%" when the digest stores 0.72, or the other way round.
    if (m[2] === '%' && (known(n / 100, allowed) || known(n * 100, allowed))) continue;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Tracing a stat back to the digest - so the UI can show the raw number
// ---------------------------------------------------------------------------

export interface MetricHit {
  path: string;
  value: unknown;
}

/** Both `"dayShape.earlyStartDays"` and just `"earlyStartDays"` resolve. */
export function lookupMetric(digest: Digest, metric: string): MetricHit | null {
  const key = metric.trim();
  if (!key) return null;

  const direct = byPath(digest, key.split('.'));
  if (direct !== undefined) return { path: key, value: direct };

  const leaf = key.split('.').pop() as string;
  return search(digest, leaf, '');
}

function byPath(o: unknown, parts: string[]): unknown {
  let cur: unknown = o;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function search(o: unknown, leaf: string, prefix: string): MetricHit | null {
  if (!o || typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (k === leaf) return { path, value: v };
    const deeper = search(v, leaf, path);
    if (deeper) return deeper;
  }
  return null;
}

// ---------------------------------------------------------------------------
// sanitizeInsight
// ---------------------------------------------------------------------------

const SEVERITIES: Severity[] = ['info', 'notable', 'important'];

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cleanSentence(v: unknown, allowed: Allowed, checkNumbers: boolean): string | null {
  const text = str(v, MAX_TEXT);
  if (!text) return null;
  if (hasBannedWord(text)) return null;
  if (checkNumbers && !numbersCheckOut(text, allowed)) return null;
  return text;
}

/**
 * @param raw    the model's JSON, trusted for nothing yet
 * @param digest the digest that WAS sent - every number must match it
 */
export function sanitizeInsight(raw: unknown, digest: Digest): InsightResult {
  const allowed = allowedValues(digest);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const observations: Observation[] = [];
  const list = Array.isArray(o.observations) ? o.observations : [];

  for (const item of list) {
    if (observations.length >= MAX_OBSERVATIONS) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;

    const title = str(r.title, MAX_TITLE);
    const body = str(r.body, MAX_BODY);
    if (!title || !body) continue;
    if (hasBannedWord(title) || hasBannedWord(body)) continue;
    if (!numbersCheckOut(body, allowed)) continue;

    const metric = str(r.metric, 60);
    observations.push({
      title,
      body,
      // A stat that cannot be traced loses its label, but the note stays:
      // the sentence passed the number check, so it is still correct.
      metric: lookupMetric(digest, metric) ? metric : '',
      severity: SEVERITIES.includes(r.severity as Severity) ? (r.severity as Severity) : 'info',
    });
  }

  // The suggestion is an action sentence, which may mention schedule times
  // (20:30) rather than measurements - so no number check here, only words.
  let suggestion: InsightResult['suggestion'] = null;
  const sug = o.suggestion as Record<string, unknown> | null | undefined;
  if (sug && typeof sug === 'object') {
    const text = cleanSentence(sug.text, allowed, false);
    if (text) {
      const p = sug.preset;
      suggestion = {
        text,
        preset: typeof p === 'string' && p in PRESETS ? (p as PresetId) : null,
      };
    }
  }

  const positive = cleanSentence(o.positive, allowed, true);

  return {
    observations,
    suggestion,
    positive,
    note: observations.length === 0 ? NOTHING_NOTABLE : null,
  };
}
