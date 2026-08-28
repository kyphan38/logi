// ============================================================
// logi - Voice → JSON qua Gemini Flash (audio input native)
// Chạy SERVER-SIDE ONLY. Không bao giờ gọi từ browser.
// ============================================================

import type { Activity, Category } from '@/types/logi';

// ------------------------------------------------------------
// 1. Structured output schema
// ------------------------------------------------------------

export const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['start', 'stop', 'log_past', 'schedule', 'edit', 'clarify', 'unknown'],
      description: 'start = bắt đầu ngay; log_past = hồi tố; schedule = bắt đầu sau N phút; edit = sửa record vừa tạo; clarify = thiếu thông tin cần hỏi lại',
    },
    category: {
      type: 'string',
      enum: ['learn', 'work', 'fitness', 'sleep', 'leisure'],
      nullable: true,
    },
    label: {
      type: 'string',
      nullable: true,
      description: 'Cụm từ ngắn người dùng nói, VD "devops", "gym", "reading". Không phải cả câu.',
    },
    startAt: {
      type: 'string',
      nullable: true,
      description: 'ISO 8601 kèm offset +07:00. Null nếu intent là stop.',
    },
    endAt: {
      type: 'string',
      nullable: true,
      description: 'ISO 8601 kèm offset +07:00.',
    },
    confidence: {
      type: 'number',
      description: '0..1. Dưới 0.85 buộc người dùng xác nhận trước khi ghi.',
    },
    clarifyQuestion: {
      type: 'string',
      nullable: true,
      description: 'Câu hỏi tiếng Anh ngắn khi mơ hồ. VD "Did you mean 10 AM or 10 PM?"',
    },
    clarifyOptions: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
      description: 'Tối đa 3 lựa chọn hiện thành nút bấm.',
    },
    targetActivityId: {
      type: 'string',
      nullable: true,
      description: 'Chỉ dùng khi intent = edit hoặc stop, trỏ tới activity trong context.',
    },
    transcript: {
      type: 'string',
      description: 'Nguyên văn người dùng nói, để hiển thị lại và debug.',
    },
  },
  required: ['intent', 'confidence', 'transcript'],
} as const;

export interface ParseResult {
  intent: 'start' | 'stop' | 'log_past' | 'schedule' | 'edit' | 'clarify' | 'unknown';
  category: Category | null;
  label: string | null;
  startAt: string | null;
  endAt: string | null;
  confidence: number;
  clarifyQuestion: string | null;
  clarifyOptions: string[] | null;
  targetActivityId: string | null;
  transcript: string;
}

// ------------------------------------------------------------
// 2. System prompt
// ------------------------------------------------------------

/**
 * Context là thứ quyết định chất lượng parse.
 * Có lịch sinh hoạt + activity gần đây, "I went out at 10" đoán được ngay là 10 PM
 * và số lần phải hỏi lại giảm hẳn.
 */
export function buildSystemPrompt(ctx: {
  nowISO: string;      // "2026-08-26T20:41:00+07:00"
  weekday: string;     // "Wednesday"
  activeActivities: Pick<Activity, 'id' | 'category' | 'label' | 'startAt'>[];
  recentActivities: Pick<Activity, 'id' | 'category' | 'label' | 'startAt' | 'endAt'>[];
}): string {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: true });

  return `You parse spoken English into time-tracking entries. Output JSON only, matching the schema.

CURRENT TIME: ${ctx.nowISO} (${ctx.weekday}), timezone Asia/Ho_Chi_Minh (+07:00).
All timestamps you emit MUST be ISO 8601 with the +07:00 offset.

CATEGORIES - map every activity to exactly one:
- learn     : studying, reading, courses, certs, researching technology, side projects for skill
- work      : the user's DevOps job, meetings, on-call, OT. ALSO the commute - "driving to work"
              or "heading to the office" STARTS work; work ends when they get home.
- fitness   : gym, running, workout, sports, stretching, physio
- sleep     : night sleep and naps
- leisure   : hanging out, dinner with friends, gaming, movies, shows, social media downtime

If an activity fits none, pick the nearest and drop confidence below 0.7.

USER'S TYPICAL SCHEDULE - use this to resolve ambiguous times:
- 04:30 wake, self-study until 06:00–06:30
- 08:00–17:00 work Mon–Fri. Tue & Thu in office (45 min commute each way)
- 18:00–19:30 workout
- 20:30–22:00 study or reading
- 22:00 sleep
- Weekends: long study blocks, sometimes unplanned work OT
- No breakfast, coffee only. Does not track meals, showering, chores.

TIME RESOLUTION RULES:
1. Bare hours: pick the reading consistent with the schedule above.
   "I went out at 10" on a weekday evening → 10 PM (leisure), confidence ~0.75.
   Only ask when both readings are genuinely plausible.
2. Relative phrasing: "11 minutes ago", "in 15 mins", "since 2", "for the last hour"
   - resolve against CURRENT TIME.
3. "This morning", "last night", "yesterday" → resolve to the concrete date.
4. Ranges: "from 8 AM to 11 AM" → intent=log_past with both startAt and endAt.
5. Future start: "start sleep in 5 mins" → intent=schedule, startAt = now + 5 min.
   Do NOT emit endAt.
6. Never emit a startAt more than 7 days in the past. If the utterance implies that,
   set intent=clarify.

STOP AND EDIT:
- "I'm done", "stop", "finished" → intent=stop. Pick targetActivityId from ACTIVE below.
  If several are active and the utterance names none, intent=clarify with the active ones
  as clarifyOptions.
- "no, that was learning", "change it to 9 AM", "it was two hours" → intent=edit,
  targetActivityId = the most recent activity, and emit only the fields that change.

CONFIDENCE - this drives whether the user must confirm, so be honest:
  0.95+  explicit category and explicit time
  0.85   clear activity, time inferred from schedule with no real ambiguity
  0.70   category inferred from an unusual phrasing
  <0.60  guessing - prefer intent=clarify instead

Ask at most ONE clarifying question, and only about the single most ambiguous field.
Never ask about something the schedule already settles.

ACTIVE NOW:
${ctx.activeActivities.length
  ? ctx.activeActivities.map((a) => `- id=${a.id} ${a.category}${a.label ? ` (${a.label})` : ''} since ${fmt(a.startAt)}`).join('\n')
  : '- none'}

RECENT:
${ctx.recentActivities.length
  ? ctx.recentActivities.slice(0, 5).map((a) => `- id=${a.id} ${a.category}${a.label ? ` (${a.label})` : ''} ${fmt(a.startAt)} → ${a.endAt ? fmt(a.endAt) : 'running'}`).join('\n')
  : '- none'}`;
}

// ------------------------------------------------------------
// 3. Gọi Gemini với audio
// ------------------------------------------------------------

export const AUTO_COMMIT_THRESHOLD = 0.85;

// gemini-2.5-flash đã bị Google ngừng cấp cho key mới (API trả 404).
// Bản lite nhanh hơn (~1.3s/câu) và bắt giờ kết thúc chuẩn hơn khi test 10 câu của roadmap.
const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Audio đi thẳng vào Gemini - không qua bước speech-to-text riêng.
 * Một lần gọi thay vì hai, và model nghe trực tiếp sẽ parse tốt hơn
 * là parse lại từ một transcript đã sai.
 * Audio KHÔNG được lưu ở bất kỳ đâu sau khi request kết thúc.
 */
export async function parseAudio(
  audioBase64: string,
  mimeType: string, // "audio/webm" (Android/desktop) | "audio/mp4" (iOS Safari/Edge)
  systemPrompt: string,
  apiKey: string
): Promise<ParseResult> {
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: 'Parse this utterance.' },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: PARSE_SCHEMA,
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  return JSON.parse(text) as ParseResult;
}

/** Sửa nhanh bằng giọng nói - gửi lại record vừa tạo, nhận về patch. */
export async function parseTextCorrection(
  utterance: string,
  systemPrompt: string,
  apiKey: string
): Promise<ParseResult> {
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: utterance }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: PARSE_SCHEMA,
        temperature: 0.1,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text) as ParseResult;
}

/**
 * iOS Safari/Edge (WebKit) KHÔNG hỗ trợ audio/webm.
 * Không kiểm tra cái này thì MediaRecorder ném lỗi ngay trên iPhone 11.
 */
export function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/mp4';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}
