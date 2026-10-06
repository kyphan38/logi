// ============================================================
// logi - Digest → notes, via Gemini Flash (Stage 7 Task 4)
// SERVER-SIDE ONLY. Never called from the browser.
//
// The model does NOT calculate. It only picks 2–4 things worth saying from
// the digest and writes them as sentences. Every number it writes is checked
// against the digest by `sanitizeInsight()` before reaching the screen.
// ============================================================

import type { Digest } from '@/lib/digest';

// ------------------------------------------------------------
// 1. Structured output schema
// ------------------------------------------------------------

export const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    observations: {
      type: 'array',
      description: 'Between 2 and 4 items. Only what matters.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'At most 8 words. No number needed.' },
          body: {
            type: 'string',
            description:
              'One or two sentences. Every number must be copied from the digest, unchanged.',
          },
          metric: {
            type: 'string',
            description: 'The digest key this is based on, e.g. "learn.morningHours".',
          },
          severity: { type: 'string', enum: ['info', 'notable', 'important'] },
        },
        required: ['title', 'body', 'metric', 'severity'],
      },
    },
    suggestion: {
      type: 'object',
      nullable: true,
      properties: {
        text: { type: 'string', description: 'One concrete, small action.' },
        preset: {
          type: 'string',
          nullable: true,
          description: 'One of: normal, crunch, deep_learn, recovery. Null if none fits.',
        },
      },
      required: ['text'],
    },
    positive: {
      type: 'string',
      nullable: true,
      description: 'One sentence about something going well. Null if nothing stands out.',
    },
  },
  required: ['observations'],
} as const;

// ------------------------------------------------------------
// 2. System prompt
// ------------------------------------------------------------

/**
 * The ten rules below translate the Stage 7 plan; rule 10 was added in
 * AMENDMENT-remove-sleep section 10.
 * After editing the prompt, rerun `test/insight-sanitize.test.ts` and read a
 * few results by hand - a looser prompt means sanitize drops more.
 */
export const INSIGHT_SYSTEM_PROMPT = `You analyse a personal time-audit digest and surface what matters.

The user is a DevOps engineer in Vietnam. Typical schedule: wake 04:30,
self-study until 06:30; work 08:00-17:00 Mon-Fri, in office Tue and Thu
(45 min commute each way, counted as work); workout 18:00-19:30;
study again 20:30-22:00. Weekends are meant for study
but often get taken by unplanned work OT.

RULES - these are absolute:
1. Every number you write must appear in the digest. Never compute,
   estimate, or infer a number that is not there.
2. Never claim causation. Say "alongside" or "on days when", never
   "because" or "due to".
3. State numbers plainly. Do not lecture, moralise, or use judging
   words like "too much", "bad", "should have".
4. No medical, clinical, or diagnostic claims of any kind.
5. Pick the 2-4 observations that matter most. Do not list everything.
6. Prefer signals the user cannot see at a glance: timing consistency,
   change versus the previous period, associations between categories.
   Raw totals are already visible in the charts.
7. If a correlation signal is present, note its sample size and that
   it is only an association.
8. Suggestion must be one concrete, small action. Not "rest more" -
   something like "protect the 20:30 study block on Tue and Thu".
9. If something is going well, say so in \`positive\`. One sentence.
10. The app does NOT track sleep. Never mention sleep, bedtime, rest,
    or tiredness, and never infer them from late or early activity.
    \`dayShape\` is about when logging starts and stops, nothing more.

READING THE DIGEST:
- Hours are hours. Fields ending in "Min" are minutes. Fields ending in
  "Pct" are percentages already, so write them with a % sign.
- Clock times are "HH:MM" in the user's local time. Copy them as they are.
- "n" is the sample size of an association. Small n means weak evidence.
- A field that is absent was not measurable. Do not guess it.
- Categories are learn, work, fitness, leisure. All four are in
  the digest so you can compare them, not so you list them all.
- \`dayShape\` describes the clock edges of logged days: when the first
  activity started and when the last one ended. It is not sleep data.

Write in English. Be brief. No preamble, no closing summary.`;

// ------------------------------------------------------------
// 3. Calling the model
// ------------------------------------------------------------

// Same model as the voice parse path: known to work with the current key.
const MODEL = 'gemini-3.8-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Cap for BOTH thinking and answering. The real result is ~200 tokens; the
 * rest is room to think. Below ~1000 the JSON gets cut off.
 */
const MAX_OUTPUT_TOKENS = 2000;

/**
 * Returns the model's RAW JSON. The caller MUST pass it through
 * `sanitizeInsight()` before sending it to the client - no exceptions.
 */
export async function analyseDigest(digest: Digest, apiKey: string): Promise<unknown> {
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSIGHT_SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: `DIGEST:\n${JSON.stringify(digest)}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: INSIGHT_SCHEMA,
        // Low to stick to the numbers, but not 0: the same week read again
        // should still read like a person wrote it, not a template.
        temperature: 0.4,
        // gemini-3.8-flash thinks before answering, and thinking COUNTS toward
        // `maxOutputTokens`. By default it spends ~800 thinking tokens, so the
        // old 700 cap always returned cut-off JSON → "Unexpected end of JSON input".
        // The job here is picking a few lines from a ready digest; no deep thinking needed.
        thinkingConfig: { thinkingLevel: 'low' },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.[0]?.text;

  // A cut-off response makes `JSON.parse` throw "Unexpected end of JSON input" -
  // useless to whoever has to fix it. Say it plainly.
  if (cand?.finishReason === 'MAX_TOKENS') {
    throw new Error(`Gemini hit the ${MAX_OUTPUT_TOKENS}-token cap before finishing`);
  }
  if (!text) throw new Error(`Gemini returned no content (finishReason=${cand?.finishReason ?? 'none'})`);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Gemini returned malformed JSON');
  }
}
