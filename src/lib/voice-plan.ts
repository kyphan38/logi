// ============================================================
// logi - Decides what to do from a ParsedCommand (writes nothing yet).
// Separate from voice-command.ts because this file does NOT import firebase,
// so `node --test` runs it directly.
// ============================================================

import { AUTO_COMMIT_THRESHOLD } from '@/lib/gemini-parse';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import type { Activity } from '@/types/logi';

export type MissingField = 'category' | 'startAt' | 'endAt' | 'bedtimeAt' | 'target';

export type VoicePlan =
  /** Confident and complete → save at once, with an Undo toast. */
  | { kind: 'commit'; cmd: ParsedCommand }
  /** Unsure or missing fields → require a Confirm tap. */
  | { kind: 'confirm'; cmd: ParsedCommand; missing: MissingField[] }
  /** The parser asks back (Task 5). May only happen once. */
  | { kind: 'clarify'; cmd: ParsedCommand }
  /** Nothing understood → open the manual sheet. There must always be a way out. */
  | { kind: 'manual'; cmd: ParsedCommand }
  /** A sentence about sleep. The app no longer tracks it - SAY SO, never skip silently. */
  | { kind: 'retired'; cmd: ParsedCommand; message: string };

/** The only reply to a sentence about sleep. */
export const SLEEP_RETIRED_MESSAGE = 'Sleep is no longer tracked.';

/** The model gave up on a BEDTIME sentence: do not open the activity sheet (saving
 *  there makes a wrong session), just point to the bedtime button on Now. */
export const BEDTIME_FALLBACK_MESSAGE = 'Tap the bedtime button in Now to log it.';

/** "bedtime", "went to bed", "going to bed" - a bedtime mark, DIFFERENT from
 *  "slept", "nap", "woke up" (those are still retired). */
const BEDTIME_WORDS = /\b(bedtime|went to bed|go to bed|going to bed|off to bed)\b/i;

export function mentionsBedtime(transcript: string): boolean {
  return BEDTIME_WORDS.test(transcript);
}

/**
 * Only checks `transcript`, and ONLY when the model gave up (`intent === 'unknown'`).
 * Checking every sentence would swallow "I stopped work and went to sleep",
 * which is a perfectly valid stop command.
 */
const SLEEP_WORDS =
  /\b(sleep|sleeping|slept|asleep|nap|napping|napped|bedtime|went to bed|go to bed|woke up|wake up|snooze)\b/i;

export function mentionsSleep(transcript: string): boolean {
  return SLEEP_WORDS.test(transcript);
}

/** Required fields per sentence type. */
function requiredOf(cmd: ParsedCommand): MissingField[] {
  switch (cmd.intent) {
    case 'start':
      return ['category']; // no time given means now
    case 'schedule':
      return ['category', 'startAt'];
    case 'log_past':
      return ['category', 'startAt', 'endAt'];
    case 'stop':
    case 'edit':
      return ['target'];
    case 'bedtime':
      return ['bedtimeAt'];
    default:
      return [];
  }
}

function missingOf(cmd: ParsedCommand): MissingField[] {
  return requiredOf(cmd).filter((f) => {
    if (f === 'category') return cmd.category === null;
    if (f === 'startAt') return cmd.startAt === null;
    if (f === 'endAt') return cmd.endAt === null;
    if (f === 'bedtimeAt') return cmd.bedtimeAt === null;
    return cmd.targetActivityId === null;
  });
}

export interface PlanContext {
  /** Running sessions, to guess the target for "stop" / "edit". */
  active: Pick<Activity, 'id'>[];
  /** The record just written (still fresh) - "no, that was learning" edits it. */
  lastCreatedId?: string | null;
  /** Already asked back once. A second round makes users stop using voice. */
  asked?: boolean;
}

export function planVoice(cmd: ParsedCommand, ctx: PlanContext): VoicePlan {
  if (cmd.intent === 'unknown') {
    // A bedtime sentence the model could not parse: still do NOT open the
    // activity sheet. Saving there would make a wrong leisure session.
    if (mentionsBedtime(cmd.transcript)) {
      return { kind: 'retired', cmd, message: BEDTIME_FALLBACK_MESSAGE };
    }
    return mentionsSleep(cmd.transcript)
      ? { kind: 'retired', cmd, message: SLEEP_RETIRED_MESSAGE }
      : { kind: 'manual', cmd };
  }
  if (cmd.intent === 'clarify') {
    // A second question is too many; open the manual sheet instead.
    return ctx.asked ? { kind: 'manual', cmd } : { kind: 'clarify', cmd };
  }

  let next = cmd;

  // Just saved, then "no, that was learning" → edit that record.
  if (next.intent === 'edit' && next.targetActivityId === null && ctx.lastCreatedId) {
    next = { ...next, targetActivityId: ctx.lastCreatedId };
  }

  // "Done" with exactly one running session → no question, it must be that one.
  if (
    (next.intent === 'stop' || next.intent === 'edit') &&
    next.targetActivityId === null &&
    ctx.active.length === 1
  ) {
    next = { ...next, targetActivityId: ctx.active[0].id };
  }

  const missing = missingOf(next);
  if (missing.length > 0) return { kind: 'confirm', cmd: next, missing };

  // Logging into the PAST always needs Confirm, however sure the model is.
  //
  // "I read for two hours last night" gives a DURATION, not TIMES. The model
  // must still return startAt/endAt, so it guesses - and then commits silently,
  // leaving a record with fake times the user never knew about. Sentences with
  // clear times ("from 8 AM to 11 AM") pass here too, but cost only one tap:
  // the card is prefilled and editable before saving.
  //
  // start/stop/edit are NOT blocked - they change the present, mistakes show at once.
  if (next.intent === 'log_past') return { kind: 'confirm', cmd: next, missing: [] };

  if (next.confidence >= AUTO_COMMIT_THRESHOLD) return { kind: 'commit', cmd: next };
  return { kind: 'confirm', cmd: next, missing: [] };
}
