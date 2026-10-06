// ============================================================
// logi - Executes a ParsedCommand. Every write still goes through activities.ts.
// The (pure) decision part lives in voice-plan.ts.
// ============================================================

import {
  createPastActivity,
  deleteActivity,
  getActivity,
  startActivity,
  stopActivity,
  updateActivity,
} from '@/lib/activities';
import { clearBedtime, setBedtime } from '@/lib/bedtime-store';
import { formatBedtime } from '@/lib/bedtime';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import { CATEGORY_LABEL } from '@/types/logi';

export {
  planVoice,
  mentionsSleep,
  mentionsBedtime,
  SLEEP_RETIRED_MESSAGE,
  BEDTIME_FALLBACK_MESSAGE,
} from '@/lib/voice-plan';
export type { MissingField, VoicePlan } from '@/lib/voice-plan';

/**
 * Exactly the write gates applyVoice may use. The real one is activities.ts;
 * tests inject a fake to check "which intent calls which function" without Firestore.
 */
export interface VoiceRepo {
  startActivity: typeof startActivity;
  createPastActivity: typeof createPastActivity;
  stopActivity: typeof stopActivity;
  updateActivity: typeof updateActivity;
  deleteActivity: typeof deleteActivity;
  getActivity: typeof getActivity;
  setBedtime: typeof setBedtime;
  clearBedtime: typeof clearBedtime;
}

const LIVE: VoiceRepo = {
  startActivity,
  createPastActivity,
  stopActivity,
  updateActivity,
  deleteActivity,
  getActivity,
  setBedtime,
  clearBedtime,
};

export interface VoiceWrite {
  message: string;
  /** The record just touched. Kept so the next sentence can edit it. */
  activityId: string;
  /** Restores the previous state. Each branch knows its own way back. */
  undo: () => Promise<void>;
}

/**
 * Writes to Firestore. Every branch calls activities.ts functions so `derive()`
 * and `validateTimes()` run exactly once, no exceptions.
 */
export async function applyVoice(
  uid: string,
  cmd: ParsedCommand,
  repo: VoiceRepo = LIVE,
): Promise<VoiceWrite> {
  const prov = {
    source: 'voice' as const,
    confidence: cmd.confidence,
    rawText: cmd.transcript || null,
  };
  const name = cmd.category ? CATEGORY_LABEL[cmd.category] : 'Session';

  switch (cmd.intent) {
    case 'start': {
      const id = await repo.startActivity(uid, {
        category: cmd.category!,
        label: cmd.label,
        startAt: cmd.startAt ?? undefined,
        ...prov,
      });
      return { activityId: id, message: `Started ${name}.`, undo: () => repo.deleteActivity(uid, id) };
    }

    case 'schedule': {
      const id = await repo.startActivity(uid, {
        category: cmd.category!,
        label: cmd.label,
        startAt: cmd.startAt!,
        status: 'scheduled',
        ...prov,
      });
      return { activityId: id, message: `${name} scheduled.`, undo: () => repo.deleteActivity(uid, id) };
    }

    case 'log_past': {
      const id = await repo.createPastActivity(uid, {
        category: cmd.category!,
        label: cmd.label,
        startAt: cmd.startAt!,
        endAt: cmd.endAt!,
        ...prov,
      });
      return { activityId: id, message: `Logged ${name}.`, undo: () => repo.deleteActivity(uid, id) };
    }

    case 'bedtime': {
      // A bedtime mark, NOT an activity. No category, no target, not in the
      // 89h budget - just a mark in dayLogs.
      const at = cmd.bedtimeAt!;
      const date = await repo.setBedtime(uid, at);
      return {
        // Bedtime has no activity, so it cannot be edited by voice next.
        // An empty string tells the caller to skip `lastCreated`.
        activityId: '',
        message: `Bedtime ${formatBedtime(at)} logged.`,
        undo: () => repo.clearBedtime(uid, date),
      };
    }

    case 'stop': {
      const id = cmd.targetActivityId!;
      await repo.stopActivity(uid, id, cmd.endAt ?? undefined);
      return {
        activityId: id,
        message: `Stopped ${name}.`,
        undo: () => repo.updateActivity(uid, id, { endAt: null, status: 'active' }),
      };
    }

    case 'edit': {
      const id = cmd.targetActivityId!;
      // Read before writing so Undo restores the exact old value, not a guess.
      const before = await repo.getActivity(uid, id);

      // Only send fields actually in the sentence, to avoid wiping old data.
      const patch: Parameters<typeof repo.updateActivity>[2] = { ...prov };
      if (cmd.category !== null) patch.category = cmd.category;
      if (cmd.label !== null) patch.label = cmd.label;
      if (cmd.startAt !== null) patch.startAt = cmd.startAt;
      if (cmd.endAt !== null) patch.endAt = cmd.endAt;
      await repo.updateActivity(uid, id, patch);

      // "Yesterday I finished dinner at midnight" lands here, not in 'stop'.
      // A sentence that ends a running session must report it as stopped.
      const ended = before.endAt === null && cmd.endAt !== null;

      return {
        activityId: id,
        message: cmd.category
          ? `Changed to ${name}.`
          : ended
            ? `Stopped ${CATEGORY_LABEL[before.category]}.`
            : 'Updated.',
        undo: () =>
          repo.updateActivity(uid, id, {
            category: before.category,
            label: before.label,
            startAt: before.startAt,
            endAt: before.endAt,
            source: before.source,
            confidence: before.confidence,
            rawText: before.rawText,
          }),
      };
    }

    default:
      throw new Error(`Cannot apply intent "${cmd.intent}"`);
  }
}
