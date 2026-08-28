// ---------------------------------------------------------------------------
// logi — Lọc kết quả model trước khi cho ra màn hình (Stage 7 Task 4 + 8)
//
// Đây là lớp bảo vệ chính. Model viết trôi chảy nên một con số bịa sẽ trông
// y hệt một con số thật; người đọc không có cách nào phát hiện. Vì vậy:
//
//   1. Mọi số trong `body` phải có mặt trong digest (sai số 0.15)
//   2. Câu nhân quả → bỏ. Một tuần dữ liệu không chứng minh được A gây ra B
//   3. Từ y tế, từ phán xét → bỏ
//   4. Quá 4 nhận xét → cắt còn 4. Bỏ hết → câu mặc định
//
// Thuần: không mạng, không Firestore. Test bằng `node --test`.
// ---------------------------------------------------------------------------
import type { Digest } from '@/lib/digest';
import { PRESETS, type PresetId } from '@/types/logi';

export type Severity = 'info' | 'notable' | 'important';

export interface Observation {
  title: string;
  body: string;
  /** Tên chỉ số trong digest — tap vào để xem số gốc. */
  metric: string;
  severity: Severity;
}

export interface InsightResult {
  observations: Observation[];
  suggestion: { text: string; preset: PresetId | null } | null;
  positive: string | null;
  /** Có giá trị khi không còn nhận xét nào sau khi lọc. */
  note: string | null;
}

export const NOTHING_NOTABLE = 'Nothing notable in this period.';

export const MAX_OBSERVATIONS = 4;
/** Sai số khi đối chiếu số: 0.15 — đủ cho làm tròn, không đủ để bịa. */
export const NUMBER_TOLERANCE = 0.15;

const MAX_TITLE = 80;
const MAX_BODY = 320;
const MAX_TEXT = 200;

// ---------------------------------------------------------------------------
// Từ cấm
// ---------------------------------------------------------------------------

/** Nhân quả: chỉ được nói "đi kèm", không được nói "vì". */
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

/** Y tế: app này không chẩn đoán bất cứ thứ gì. */
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

/** Phán xét: nêu số, không dạy đời. */
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

const BANNED = [...CAUSAL, ...MEDICAL, ...JUDGING];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED_RE = new RegExp(`\\b(${BANNED.map(escape).join('|')})\\b`, 'i');

/** Câu có từ cấm → bỏ cả câu, không cố sửa. Sửa văn của model là bịa tiếp. */
export function hasBannedWord(text: string): boolean {
  return BANNED_RE.test(text);
}

// ---------------------------------------------------------------------------
// Đối chiếu số với digest
// ---------------------------------------------------------------------------

interface Allowed {
  numbers: number[];
  times: Set<string>;
}

/**
 * Giờ đến từ ĐỊNH NGHĨA chứ không phải từ dữ liệu: lịch sinh hoạt trong system
 * prompt (04:30 dậy, 20:30 học) và các mốc mà chính chỉ số mang tên
 * (`nightsAfter23`, `after22Hours`). Không cho phép thì model nói đúng
 * "four nights after 23:00" vẫn bị bỏ oan.
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
      // "23:40" cũng cho phép viết thành 23 giờ 40 phút nếu model tách ra.
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
 * Mọi con số trong câu phải truy được về digest.
 * Chấp nhận ba cách viết: `23:40`, `1h20m`, và số thường (kèm `%` thì so
 * thêm với dạng phân số).
 */
export function numbersCheckOut(body: string, allowed: Allowed): boolean {
  let text = body;

  // 1. Giờ đồng hồ
  const times = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  for (const t of times) {
    const [h, m] = t.split(':');
    if (!allowed.times.has(`${h.padStart(2, '0')}:${m}`)) return false;
  }
  text = text.replace(/\b\d{1,2}:\d{2}\b/g, ' ');

  // 2. "1h20m" — chấp nhận cả cách đọc theo giờ lẫn theo phút
  const spans = [...text.matchAll(/\b(\d+)\s?h\s?(\d+)\s?m\b/gi)];
  for (const s of spans) {
    const h = Number(s[1]);
    const m = Number(s[2]);
    if (!known(h + m / 60, allowed) && !known(h * 60 + m, allowed)) return false;
  }
  text = text.replace(/\b(\d+)\s?h\s?(\d+)\s?m\b/gi, ' ');

  // 3. Số còn lại
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(%?)/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return false;
    if (known(n, allowed)) continue;
    // "72%" khi digest lưu 0.72, hoặc ngược lại.
    if (m[2] === '%' && (known(n / 100, allowed) || known(n * 100, allowed))) continue;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Tra ngược chỉ số về digest — để UI hiện số gốc
// ---------------------------------------------------------------------------

export interface MetricHit {
  path: string;
  value: unknown;
}

/** `"sleep.medianBedtime"` hoặc chỉ `"medianBedtime"` đều tra được. */
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
 * @param raw    JSON model trả về, chưa tin được gì cả
 * @param digest bản digest ĐÃ gửi đi — mọi con số phải khớp với nó
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
      // Chỉ số không tra được thì bỏ nhãn, nhưng vẫn giữ nhận xét:
      // câu đã qua được bước đối chiếu số nên nó vẫn đúng.
      metric: lookupMetric(digest, metric) ? metric : '',
      severity: SEVERITIES.includes(r.severity as Severity) ? (r.severity as Severity) : 'info',
    });
  }

  // Gợi ý là câu hành động, có thể nhắc giờ trong lịch sinh hoạt (20:30) chứ
  // không phải số đo — nên không soi số ở đây, chỉ soi từ ngữ.
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
