// ============================================================
// logi - Voice → JSON via Gemini Flash (native audio input)
// SERVER-SIDE ONLY. Never called from the browser.
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
      enum: ['start', 'stop', 'log_past', 'schedule', 'edit', 'bedtime', 'clarify', 'unknown'],
      description: 'start = start now; log_past = log something already done; schedule = start in N minutes; edit = fix the record just made; bedtime = a bedtime mark, NOT a session; clarify = missing info, ask back',
    },
    category: {
      type: 'string',
      enum: ['learn', 'work', 'fitness', 'leisure'],
      nullable: true,
    },
    label: {
      type: 'string',
      nullable: true,
      description: 'The short phrase the user said, e.g. "devops", "gym", "reading". Not the whole sentence.',
    },
    startAt: {
      type: 'string',
      nullable: true,
      description: 'ISO 8601 with offset +07:00. Null if intent is stop.',
    },
    endAt: {
      type: 'string',
      nullable: true,
      description: 'ISO 8601 with offset +07:00.',
    },
    confidence: {
      type: 'number',
      description: '0..1. Below 0.85 the user must confirm before saving.',
    },
    clarifyQuestion: {
      type: 'string',
      nullable: true,
      description: 'A short English question when unclear. E.g. "Did you mean 10 AM or 10 PM?"',
    },
    clarifyOptions: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
      description: 'At most 3 choices, shown as buttons.',
    },
    bedtimeAt: {
      type: 'string',
      nullable: true,
      description: 'ISO 8601 with offset +07:00. Only when intent = bedtime: the time of going to bed.',
    },
    targetActivityId: {
      type: 'string',
      nullable: true,
      description: 'Only when intent = edit or stop; points to an activity in the context.',
    },
    transcript: {
      type: 'string',
      description: 'Exactly what the user said, for display and debugging.',
    },
  },
  required: ['intent', 'confidence', 'transcript'],
} as const;

export interface ParseResult {
  intent: 'start' | 'stop' | 'log_past' | 'schedule' | 'edit' | 'bedtime' | 'clarify' | 'unknown';
  category: Category | null;
  label: string | null;
  startAt: string | null;
  endAt: string | null;
  /** Bedtime, ISO 8601. Only meaningful when intent = bedtime. */
  bedtimeAt: string | null;
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
 * Context decides parse quality.
 * With the daily schedule + recent activities, "I went out at 10" is clearly
 * 10 PM, and far fewer questions need asking back.
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
- leisure   : hanging out, dinner with friends, gaming, movies, shows, social media downtime

If an activity fits none, pick the nearest and drop confidence below 0.7.

SLEEP IS NOT TRACKED as a session. There is no sleep category any more.
Going to bed is recorded as a single bedtime MARKER, never as an activity:

- "going to bed now", "I went to bed at 11:30", "bedtime 23:45"
  → intent=bedtime, bedtimeAt = that moment, category=null.
  "now" means CURRENT TIME. "at 11:30" resolves like any other clock time.
- Anything else about sleeping, napping, or waking up ("I slept 8 hours",
  "I woke up at 6") → intent=unknown with category=null, keep the spoken
  words in \`transcript\` as they are.

Do NOT map bedtime or sleep onto leisure or any other category, and do not
silently drop it. A bedtime utterance MUST NEVER create an activity.

USER'S TYPICAL SCHEDULE - use this to resolve ambiguous times:
- 04:30 wake, self-study until 06:00–06:30
- 08:00–17:00 work Mon–Fri. Tue & Thu in office (45 min commute each way)
- 18:00–19:30 workout
- 20:30–22:00 study or reading
- 22:00 stops logging for the day
- Weekends: long study blocks, sometimes unplanned work OT
- No breakfast, coffee only. Does not track meals, showering, chores.

INTENT - the deciding question is whether the activity has ENDED:

- 'start'    : still going on right now. startAt may be NOW or in the PAST.
               Do NOT emit endAt.
- 'log_past' : finished. Requires BOTH startAt and endAt.
- 'schedule' : has not begun yet. startAt is in the future.

Choose 'start' with a past startAt when the utterance signals the activity
is still running:
  "haven't finished", "still", "not done", "am still", "keep", "ongoing",
  "since 2 PM", "for the last hour", "started X ago" with no end given.

"until now", "so far", "up to now" mean STILL RUNNING. They are NOT an
end time. Never turn them into endAt.

Only choose 'log_past' when the utterance clearly says it stopped:
  "finished", "done", "stopped", "ended", "from X to Y", "for 2 hours"
  spoken about a completed block.

Examples:
  "I started watching YouTube 30 minutes ago and haven't finished yet"
    → start, startAt = now − 30min, no endAt
  "I've been working since 8 AM"
    → start, startAt = 8:00 today, no endAt
  "I started studying an hour ago, still going"
    → start, startAt = now − 1h, no endAt
  "I worked on devops from 8 AM to 11 AM"
    → log_past, both times
  "I finished cooking 11 minutes ago"
    → log_past, endAt = now − 11min
  "I'll start studying in 5 minutes"
    → schedule, startAt = now + 5min

TIME RESOLUTION RULES:
1. Bare hours: pick the reading consistent with the schedule above.
   "I went out at 10" on a weekday evening → 10 PM (leisure), confidence ~0.75.
   Only ask when both readings are genuinely plausible.
2. Relative phrasing: "11 minutes ago", "in 15 mins", "since 2", "for the last hour"
   - resolve against CURRENT TIME.
3. "This morning", "last night", "yesterday" → resolve to the concrete date.
4. Ranges: "from 8 AM to 11 AM" → intent=log_past with both startAt and endAt.
5. Future start: "start work in 5 mins" → intent=schedule, startAt = now + 5 min.
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
// 3. Calling Gemini with audio
// ------------------------------------------------------------

export const AUTO_COMMIT_THRESHOLD = 0.85;

// Google stopped granting gemini-2.5-flash to new keys (the API returns 404).
// Every app in the workspace shares gemini-3.8-flash. The ~1.3s/sentence below
// was measured on the old 3.5 lite - re-measure the roadmap's 10 sentences on the new model.
const MODEL = 'gemini-3.8-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Audio goes straight to Gemini - no separate speech-to-text step.
 * One call instead of two, and a model hearing the audio parses better
 * than re-parsing an already wrong transcript.
 * Audio is NEVER stored anywhere after the request ends.
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

/** Quick voice fix - sends the record just made, gets back a patch. */
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
 * iOS Safari/Edge (WebKit) do NOT support audio/webm.
 * Without this check MediaRecorder throws at once on an iPhone 11.
 */
export function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/mp4';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}
