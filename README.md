This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# logi

## Backup & restore

Firestore free tier does not back up your data. Do it yourself.

**Export.** Analytics → `Export` → pick `All time` + `JSON`. The file holds
every record, all week targets, and the debt ledger. On the first Sunday of
each month the app shows a reminder line with the days since your last export.

**Restore.** Go to `/settings/restore` (hidden - there is no link to it). Pick
the JSON file, read the preview, then type `RESTORE`.

Restore **only adds records that are missing**, matched by `id`. It never
overwrites and never deletes. Running it twice is safe. Week targets in the
file are shown but not restored: the file keeps the hours only, not the preset
or the debt, so rebuilding them would create half-correct weeks. Set them again
on the Targets page.

## Firestore reads (free tier: 50k/day)

Every screen keeps its listeners in a `useEffect` and drops them on unmount, so
leaving a screen stops the reads. Counted per screen:

| Screen | Live listeners | One-shot reads |
|---|---|---|
| Now | active, scheduled, today, this week, week target, review flag (6) | rollover: ~4 docs, once per week |
| History | selected day, strip week(s), week target (3–4) | - |
| Targets | week target, debt (2) | last 6 week targets |
| Analytics | one query for the whole range (1) | export nudge: 2 docs |

The History day strip runs **one query per week**, not one per day. Analytics
runs **one query per range**, not one per day. `promoteScheduled` only polls
while a scheduled session exists, and only queries once its start time passes.

**Estimated normal day** (~15 records, ~105 in the week, app opened ~15 times):

```
Now      15 opens × ~124 docs   ≈ 1,900
History   3 opens × ~200 docs   ≈   600
Targets   2 opens × ~8 docs     ≈    16
Analytics 1 open  × ~450 docs   ≈   450
writes echoed back to listeners  ≈    90
                                 -------
                                 ≈ 3,000 reads/day
```

That is 6% of the free tier. **Over 20k/day means a listener is leaking** -
check that new hooks return their unsubscribe function.

Two things are expensive on purpose: an all-time export and a restore each read
every record (~3k after a year). Both are manual and rare.

## Edge cases you should know

**Hours are never split across days.** Every number about **how many hours**
belongs, whole, to the `logicalDate` of the session's `startAt`. A Leisure
session 22:00 → 01:00 puts all 3h on the first day; the second day gets 0h.
Balance, the Analytics table and the By-day chart all follow this rule, so they
always agree. Only the **heatmap** uses real clock time, because it answers a
different question - see the heatmap note below.

**Time zone.** A logical day runs 04:00 → 04:00, using the **device** clock. Fly
to another time zone and the same session can land on a different logical day
than it would at home. The app does not store a time zone per record. For one
person in one country this is fine; a trip of a few days will shift a few
records by one day. Nothing breaks, the totals just move.

**Sessions across the 04:00 line.** A session belongs to the logical day of its
`startAt`. A film from 22:00 Mon → 01:00 Tue is one whole row on **Monday**,
marked `→ next day`. Late OT works the same way - a shift that ends 00:15 is
late Monday night, not Tuesday work.

**History never shows untracked time outside your day.** The untracked gaps are
drawn only between your first and your last record of that day. The app does not
track sleep, so it makes no guess about the hours before you started or after
you stopped.

**The heatmap will not match the category totals on late-night days.** They
answer different questions and this is on purpose. Category totals follow the
**logical** day (04:00 → 04:00). The heatmap follows the **clock**: its columns
are calendar days and its cells are filled by when the thing really happened, so
a Learn block 22:00 Mon → 00:30 Tue also fills the 00:00 cell of the *Tuesday*
column even though the record counts towards Monday.

**Watch item: 04:00 is only 30 minutes before the usual 04:30 wake-up.** The
04:00 line was first drawn for sleep, but it still earns its place: the 04:30
study block must land on the right day, and a film or OT past midnight must
count towards the day before. Wake at 03:45 and start studying, though, and that
Learn session lands on the **previous** day. Not a problem while the wake-up
stays at 04:30. If waking before 04:00 becomes a habit, lower `DAY_CUTOFF_HOUR`
to **03:00** - it still puts a 00:15 finish on the day before, but leaves more
room for the morning.

**Device clock set back.** Timers never show a negative number - elapsed time is
clamped to `0:00`.

**Scheduled sessions that never happened.** A `scheduled` session more than 7
days past its start time becomes `abandoned` the next time you open the app. It
stays in your history but no longer counts as hours. Without this it would be
promoted to `active` and show up as a session running for 240 hours.

## Security review (2026-08-28)

| # | Check | Result |
|---|---|---|
| 1 | No secret in git history | Pass - only placeholders in the roadmap docs |
| 2 | No secret in a `NEXT_PUBLIC_*` var | Pass - Firebase web config only, public by design |
| 3 | Firestore rules deny another user's data | Pass - every path is behind `isOwner(uid)`, catch-all denies |
| 4 | `/api/parse` rejects a request with no session cookie | Pass - 401 before anything else runs |
| 5 | Rate limit on `/api/parse` | Pass - 30 requests / 5 min per user |
| 6 | Allowlist blocks other emails | Pass - `ALLOWED_USER_EMAIL`, checked on login and on every request |
| 7 | Session cookie `httpOnly` + `secure` + `sameSite: lax` | Pass (`secure` in production only, so localhost still works) |
| 8 | No audio written to disk or Storage | Pass - audio goes to Gemini in the request body and is never stored |
| 9 | No personal data in production logs | Pass - logs carry error names only, never labels or transcripts |
| 10 | Firebase Console → Authorized domains | **Manual - check this yourself in the console** |
| 11 | Rules of another app cannot wipe ours | Pass - logi has its own Firebase project `kyphan38-logi-app`; `cogi` and `noda` have their own |

logi has its own Firebase project, `kyphan38-logi-app`, and uses the `(default)`
database in it. The id still lives in `src/lib/db-id.ts`, so there is one place
to change it.

Sharing a project was the real problem, not sharing a database: one Auth user
pool, one set of Cloud Function names, one quota. Now `firebase deploy` releases
one ruleset, into a project no other app can reach.

The old data in `kyphan38-apps` / `logi-db` is left in place as a backup and is
not deleted. See `roadmap/PLAN-project-split-logi.md`.

Item 10 is the only one a script cannot check. Open Firebase Console → Auth →
Settings → Authorized domains, and remove anything that is not your real domain
or `localhost`.

## Voice prompt tuning

`buildSystemPrompt()` in `src/lib/gemini-parse.ts` is the only thing to change
when a spoken sentence is parsed wrong. Do not touch the schema, the model, or
the confidence thresholds.

Keep a short list - sentence said → what you got → what you wanted - and
revisit it every few weeks. Re-run the Stage 3 sentences after each edit.

| Date | Said | Got | Wanted | Fix |
|---|---|---|---|---|
| 2026-08-29 | "I started watching YouTube 30 minutes ago and haven't finished yet" | `log_past`, card asked for an End time that does not exist | a running session, `startAt` = now − 30 min | `INTENT` block in the prompt: the deciding question is whether the activity has **ended**, not whether the start time is in the past |
| 2026-08-29 | "…started 30 minutes ago, until now still watching" | `endAt` = now, session closed | still running | same block: "until now" / "so far" mean still running, never an end time |

The prompt is a suggestion, not a guarantee, so `sanitizeParse()` repairs the
two shapes that cannot be true: `log_past` with no `endAt` becomes `start`, and
`start` with an `endAt` loses it. One exception - if the spoken end time was
real but backwards (`8 AM to 7 AM`), the entry stays `log_past` and the card
asks for the end time again.

## PWA & push notifications

Decided on 2026-08-28: **yes, do it.** The cost is a card on file for the Blaze
plan, and installing from Safari once. In return the 06:15 / 20:45 / Sunday
19:00 reminders reach the lock screen with the app closed.

What was built:

| Piece | Where |
|---|---|
| Web manifest (`standalone`, icons, theme) | `src/app/manifest.ts` |
| Icons, generated from code | `scripts/make-icons.mjs` → `public/icons/` |
| Service worker - push only, **no caching** | `public/sw.js` |
| Permission + FCM token, saved to `users/{uid}/meta/fcm` | `src/lib/push.ts` |
| Turn on / turn off | `/settings` (linked from Targets) |
| Scheduled sender, every 15 minutes | `functions/src/index.ts` |

The function sends **data-only** messages and the service worker draws the
notification. Sending a `notification` payload as well would show the same
reminder twice. One reminder type is sent once per logical day (`meta/pushLog`).
In-app reminders from Stage 4 still run - push is the extra, not the
replacement.

### Setting it up (once)

1. Firebase Console → upgrade the project to **Blaze**. Cloud Functions needs
   it. Two scheduled jobs stay inside the free tier of Cloud Scheduler (3 jobs).
2. Console → Project settings → Cloud Messaging → **Web Push certificates** →
   generate a key pair. Put it in `.env.local` and in Vercel:
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY=...`
3. `firebase deploy --only firestore:indexes` - the sender needs the
   collection-group index on `meta.token`.
4. `cd functions && npm install && cd .. && firebase deploy --only functions`
5. On the iPhone: open the site **in Safari** (not Edge - iOS only allows this
   from Safari), tap Share → *Add to Home Screen*. Open the app from that new
   icon, go to Settings, tap *Turn on reminders*.

Step 5 is not optional. iOS only delivers web push to an app that was added to
the Home Screen, so `/settings` will say "not supported" in a normal browser tab.

### Keeping the two clocks in sync

`functions/src/time.ts` repeats the logical-day rules from `src/lib/balance.ts`,
because the function is deployed separately and cannot import app code.
`test/functions-time.test.ts` compares the two copies hour by hour, including
the week that crosses into a new year. If you change the day cutoff or the week
id format, that test fails until both copies agree.

### If you want to stop paying

Delete the two functions (`firebase deploy --only functions` after removing
them, or `firebase functions:delete pushReminders trimPushLog`) and downgrade to
Spark. The app keeps working; you just lose lock-screen reminders.

## AI insights (Stage 7)

The Analytics screen has an **Analyse this period** button under the charts.
The rule behind the whole feature is one line:

> **Code does the arithmetic. The model only picks what is worth saying.**

Pipeline: `signals.ts` computes ~15 metrics per category from raw activities →
`digest.ts` turns them into a small JSON summary → `/api/insight` sends that
summary to Gemini → `insight-sanitize.ts` throws away anything the digest does
not support. Raw records never leave the device for the model, and the model is
never asked to add two numbers together.

### What it costs

About **1,600 tokens per run** on `gemini-3.8-flash` (roughly 1,200 in,
400 out). Two things keep that from repeating:

- The result is cached in `users/{uid}/insights/{from_to}`, keyed by
  `digestHash`. Same data, same range → no API call at all.
- `canAnalyze()` blocks the call entirely below 3 elapsed days, or when the log
  is too thin - big gaps inside your active hours, or too few days with any
  record. A guess from 40% of the truth is worse than no guess.

`Refresh` forces a new call. Editing a record changes the hash, so the next run
is real. Only the 20 newest insights are kept per user.

### Guardrails

- The sanitizer drops any sentence with a number that is not in the digest, any
  causal claim (`because`, `led to`), any medical word (`burnout`, `insomnia`),
  and any judgement (`too much`, `you should`). If everything is dropped, the
  panel says `Nothing notable in this period.`
- Correlations (group G) need at least 3 samples or they never reach the model.
- Severity changes font weight only. **No red, no alarms.**
- A suggested preset links to `/targets?suggest=…` and is only highlighted
  there. Nothing is ever applied without a tap and a confirm.
- Extreme numbers get one flat line written by `extremeNote()` in `digest.ts` -
  by code, not by the model - measured against your own targets, not against
  medical advice.
- The digest is never logged in production; API errors log `e.message` only.
- Delete everything the model wrote from **Settings → Saved insights**. Your
  records are untouched.

### Deploying

`firestore.rules` gained an `insights/{insightId}` match. Firestore does not
cascade a parent `match`, so without `firebase deploy --only firestore:rules`
saving an insight fails and every run hits the API.
