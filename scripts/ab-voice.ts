// ------------------------------------------------------------------
// logi - A/B for the voice parser: the live model vs a faster candidate.
// ('minimal' thinking was tried on 2026-11-16: gemini-3.8-flash rejects it with 400.)
//
//   node --import ./test/register.mjs --env-file=.env.local scripts/ab-voice.ts
//
// Sends sample sentences as text (same prompt as the app, empty context) and
// checks the entries against what the sentence means. Prints a pass count and
// the median time per setting. Text only: audio adds upload time on top.
// ------------------------------------------------------------------

import { buildSystemPrompt, parseTextCorrection, type Thinking } from '@/lib/gemini-parse';
import { sanitizeEntries, type ParsedCommand } from '@/lib/parse-sanitize';

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY missing (run with --env-file=.env.local)');

const H = 3_600_000;
const vnHour = (ms: number | null) =>
  ms === null ? null : Number(new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }));

type Check = (e: ParsedCommand[], now: number) => string | null;
const cases: { say: string; check: Check }[] = [
  {
    say: 'I studied from 8 until now',
    check: (e, now) =>
      e.length === 1 && e[0].intent === 'log_past' && e[0].category === 'learn' && e[0].endAt !== null && Math.abs(e[0].endAt - now) < 5 * 60_000
        ? null
        : 'expected one finished learn block ending now',
  },
  {
    say: 'Worked 8 to 12, gym 6 to 7, then studied until now',
    check: (e) =>
      e.length === 3 && e.map((x) => x.category).join() === 'work,fitness,learn' && e.every((x) => x.intent === 'log_past')
        ? null
        : 'expected work, fitness, learn as three finished blocks',
  },
  {
    say: 'Yesterday I slept at 11:30',
    check: (e, now) =>
      e.length === 1 && e[0].intent === 'bedtime' && e[0].bedtimeAt !== null && vnHour(e[0].bedtimeAt) === 23 && now - e[0].bedtimeAt < 48 * H
        ? null
        : 'expected a bedtime at 23:30 yesterday',
  },
  {
    say: "I went to bed at 1 last night and I'm starting work now",
    check: (e) =>
      e.length === 2 && e[0].intent === 'bedtime' && vnHour(e[0].bedtimeAt) === 1 && e[1].intent === 'start' && e[1].category === 'work'
        ? null
        : 'expected bedtime 01:00 then start work',
  },
  {
    say: "I've been reading since 7, still going",
    check: (e) => (e.length === 1 && e[0].intent === 'start' && e[0].endAt === null ? null : 'expected a running start'),
  },
  {
    say: 'Gym from 6 to 7:30',
    check: (e) => (e.length === 1 && e[0].intent === 'log_past' && e[0].category === 'fitness' ? null : 'expected one fitness block'),
  },
  {
    say: 'I woke up at 6',
    check: (e) => (e.length === 1 && e[0].intent === 'unknown' ? null : 'expected unknown (waking is not tracked)'),
  },
  {
    say: 'Dinner with friends from 7 to 9, then I watched a movie until now',
    check: (e) =>
      e.length === 2 && e.every((x) => x.category === 'leisure' && x.intent === 'log_past') ? null : 'expected two finished leisure blocks',
  },
  {
    say: 'Start studying in 10 minutes',
    check: (e) => (e.length === 1 && e[0].intent === 'schedule' && e[0].category === 'learn' ? null : 'expected a scheduled learn'),
  },
  {
    say: 'From 2 to 4 I did a course on Kubernetes and then had a meeting till 5',
    check: (e) =>
      e.length === 2 && e[0].category === 'learn' && e[1].category === 'work' ? null : 'expected learn then work',
  },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function run(thinking: Thinking, model = 'gemini-3.8-flash') {
  const times: number[] = [];
  let pass = 0;
  for (const c of cases) {
    const now = Date.now();
    const prompt = buildSystemPrompt({
      nowISO: new Date(now + 7 * H).toISOString().replace('Z', '+07:00'),
      weekday: new Date(now).toLocaleDateString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long' }),
      activeActivities: [],
      recentActivities: [],
    });
    const t0 = Date.now();
    try {
      const raw = await parseTextCorrection(c.say, prompt, key!, thinking, model);
      times.push(Date.now() - t0);
      const entries = sanitizeEntries(raw, { now, knownIds: new Set() });
      // Any finished block must have an end, and not in the future.
      const sane = entries.every((x) => x.intent !== 'log_past' || (x.endAt !== null && x.endAt <= now + 5 * 60_000));
      const err = sane ? c.check(entries, now) : 'a finished block has no end or ends in the future';
      if (err === null) pass++;
      else console.log(`  [${model} ${thinking}] FAIL "${c.say}": ${err} - got ${entries.map((x) => `${x.intent}/${x.category}`).join(', ')}`);
    } catch (e) {
      times.push(Date.now() - t0);
      console.log(`  [${model} ${thinking}] ERROR "${c.say}": ${(e as Error).message.slice(0, 80)}`);
    }
  }
  console.log(`${model} ${thinking}: ${pass}/${cases.length} passed, median ${median(times)} ms, max ${Math.max(...times)} ms`);
}

await run('low');
await run('low', 'gemini-3.5-flash-lite');
