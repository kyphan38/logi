'use client';

// ============================================================
// logi - Connects the mic button to /api/parse, then writes via activities.ts.
// Keeps the whole flow in one place so the Now page does not bloat.
// ============================================================

import { useCallback, useRef, useState } from 'react';

import type { Recording } from '@/hooks/useRecorder';
import { ActivityError } from '@/lib/activities';
import { createOnce } from '@/lib/once';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import { applyVoice, planVoice } from '@/lib/voice-command';
import type { Activity } from '@/types/logi';

export interface VoicePending {
  cmd: ParsedCommand;
  requestId: string;
}

/** The parser asks back exactly one question (Task 5). */
export interface VoiceClarify {
  question: string;
  options: string[];
  transcript: string | null;
  requestId: string;
}

type Push = (message: string, action?: { label: string; run: () => void }) => void;

/** After this long, assume the network is dead and let the user retry. */
const WRITE_TIMEOUT_MS = 8_000;

/** Speaking again within 5 minutes means editing the record just made. Later, it does not. */
const LAST_CREATED_TTL_MS = 5 * 60_000;

function msg(e: unknown): string {
  if (e instanceof ActivityError && e.code === 'duplicate') return 'That is already running.';
  return e instanceof Error ? e.message : String(e);
}

export function useVoice(uid: string | null, active: Activity[], push: Push) {
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<VoicePending | null>(null);
  const [clarify, setClarify] = useState<VoiceClarify | null>(null);

  // The record just written, so "no, that was learning" knows what to fix.
  const lastCreated = useRef<{ id: string; at: number } | null>(null);
  const lastCreatedId = useCallback((): string | null => {
    const last = lastCreated.current;
    if (last === null) return null;
    return Date.now() - last.at < LAST_CREATED_TTL_MS ? last.id : null;
  }, []);

  // One requestId writes only once. Tapping Confirm twice, or MicButton firing
  // onResult again after a flaky network, never makes a duplicate.
  // If the write fails, `once` releases the id, so the same sentence can be retried.
  const once = useRef(createOnce());
  const commit = useCallback(
    async (cmd: ParsedCommand, requestId: string) => {
      if (!uid) return;

      setSaving(true);
      try {
        await once.current.run(requestId, async () => {
          // Deliberately NO capWait here. capWait drops the real promise, losing
          // the undo function. The voice flow just called the server, so the network is up.
          const done = await Promise.race([
            applyVoice(uid, cmd),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('Saving took too long.')), WRITE_TIMEOUT_MS)
            ),
          ]);
          // Bedtime has no activity (`activityId` is empty), so it cannot be
          // edited by voice next - keep the old lastCreated instead of pointing at nothing.
          if (done.activityId) lastCreated.current = { id: done.activityId, at: Date.now() };
          else lastCreated.current = null;
          setPending(null);
          setClarify(null);
          push(done.message, {
            label: 'Undo',
            run: () => {
              // After an edit is undone the old record is still there; do not point at the dropped one.
              lastCreated.current = null;
              void done.undo().catch((e) => push(`Could not undo. ${msg(e)}`));
            },
          });
        });
      } catch (e) {
        push(`Could not save. ${msg(e)}`);
      } finally {
        setSaving(false);
      }
    },
    [uid, push]
  );

  /** The user edited the card and tapped Confirm. */
  const confirmPending = useCallback(
    (edited: ParsedCommand) => {
      if (!pending) return;
      void commit(edited, pending.requestId);
    },
    [pending, commit]
  );

  const cancelPending = useCallback(() => setPending(null), []);
  const cancelClarify = useCallback(() => setClarify(null), []);

  /**
   * Act once decided. `asked` = already asked back once; if still stuck, open
   * the manual sheet instead of a second question.
   */
  const runPlan = useCallback(
    async (cmd: ParsedCommand, requestId: string, asked: boolean, onManual: () => void) => {
      const plan = planVoice(cmd, {
        active,
        lastCreatedId: lastCreatedId(),
        asked,
      });

      if (plan.kind === 'commit') {
        // `plan.cmd`, not `cmd`: planVoice may have filled in targetActivityId.
        setClarify(null);
        await commit(plan.cmd, requestId);
      } else if (plan.kind === 'confirm') {
        setClarify(null);
        // The card recomputes missing fields from what is typed,
        // so `plan.missing` only decides whether to ask.
        setPending({ cmd: plan.cmd, requestId });
      } else if (plan.kind === 'clarify') {
        setClarify({
          question: cmd.clarifyQuestion ?? 'Which one did you mean?',
          options: cmd.clarifyOptions ?? [],
          transcript: cmd.transcript,
          requestId,
        });
      } else if (plan.kind === 'retired') {
        // Talking about sleep. Say plainly the app no longer tracks it - silently
        // opening the manual sheet makes the user think it misheard and repeat.
        setClarify(null);
        push(plan.message);
      } else {
        setClarify(null);
        push('Did not catch that. Fill it in instead.');
        onManual();
      }
    },
    [active, lastCreatedId, commit, push]
  );

  const handleRecording = useCallback(
    async (rec: Recording, onManual: () => void) => {
      if (!uid) return;
      const requestId = crypto.randomUUID();

      setThinking(true);
      setPending(null);
      setClarify(null);
      try {
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: rec.base64,
            mimeType: rec.mimeType,
            requestId,
          }),
        });

        const body = (await res.json().catch(() => null)) as
          | (ParsedCommand & { requestId: string; error?: string })
          | null;

        if (!res.ok || !body) {
          // The server refused (quota, too long, broken key) - do not abandon the
          // user midway, open the sheet to log by hand.
          push(body?.error ?? 'Voice failed. Fill it in instead.');
          onManual();
          return;
        }

        await runPlan(body, requestId, false, onManual);
      } catch (e) {
        // Offline: fetch throws at once. Manual logging must still work.
        push(`Voice failed. ${msg(e)}`);
        onManual();
      } finally {
        setThinking(false);
      }
    },
    [uid, push, runPlan]
  );

  /**
   * A choice tapped in the question. Send it back to the parser with the
   * original sentence - only it knows what intent "10:00 PM" is. Keep the
   * requestId so one sentence still writes only one record.
   */
  const answerClarify = useCallback(
    async (option: string, onManual: () => void) => {
      const asking = clarify;
      if (!uid || asking === null) return;

      const said = asking.transcript ? `"${asking.transcript}"` : 'The last utterance';
      const text = `${said} - asked "${asking.question}", the user answered "${option}". Emit the final command now.`;

      setThinking(true);
      try {
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, requestId: asking.requestId }),
        });

        const body = (await res.json().catch(() => null)) as
          | (ParsedCommand & { requestId: string; error?: string })
          | null;

        if (!res.ok || !body) {
          push(body?.error ?? 'Voice failed. Fill it in instead.');
          setClarify(null);
          onManual();
          return;
        }

        await runPlan(body, asking.requestId, true, onManual);
      } catch (e) {
        push(`Voice failed. ${msg(e)}`);
        setClarify(null);
        onManual();
      } finally {
        setThinking(false);
      }
    },
    [uid, clarify, push, runPlan]
  );

  return {
    thinking,
    saving,
    pending,
    clarify,
    handleRecording,
    confirmPending,
    cancelPending,
    answerClarify,
    cancelClarify,
  };
}
