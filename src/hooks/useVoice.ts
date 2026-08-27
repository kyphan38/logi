'use client';

// ============================================================
// logi — Nối nút mic với /api/parse rồi ghi qua activities.ts.
// Giữ toàn bộ luồng ở một chỗ để trang Now không phình ra.
// ============================================================

import { useCallback, useRef, useState } from 'react';

import type { Recording } from '@/hooks/useRecorder';
import { ActivityError } from '@/lib/activities';
import { createOnce } from '@/lib/once';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import { applyVoice, planVoice, type MissingField } from '@/lib/voice-command';
import type { Activity } from '@/types/logi';

export interface VoicePending {
  cmd: ParsedCommand;
  missing: MissingField[];
  requestId: string;
}

/** Máy hỏi lại đúng một câu (Task 5). */
export interface VoiceClarify {
  question: string;
  options: string[];
  transcript: string | null;
  requestId: string;
}

type Push = (message: string, action?: { label: string; run: () => void }) => void;

/** Sau ngần này thì coi như mạng chết, cho người dùng bấm lại. */
const WRITE_TIMEOUT_MS = 8_000;

/** Nói tiếp trong 5 phút thì hiểu là đang sửa record vừa ghi. Lâu hơn thì thôi. */
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

  // Record vừa ghi xong, để "no, that was learning" biết sửa cái nào.
  const lastCreated = useRef<{ id: string; at: number } | null>(null);
  const lastCreatedId = useCallback((): string | null => {
    const last = lastCreated.current;
    if (last === null) return null;
    return Date.now() - last.at < LAST_CREATED_TTL_MS ? last.id : null;
  }, []);

  // Cùng một requestId chỉ được ghi một lần. Bấm Confirm hai lần, hay
  // MicButton bắn onResult lại sau khi mạng chập chờn, đều không tạo bản trùng.
  // Ghi hỏng thì `once` tự nhả id ra, người dùng thử lại được đúng câu đó.
  const once = useRef(createOnce());
  const commit = useCallback(
    async (cmd: ParsedCommand, requestId: string) => {
      if (!uid) return;

      setSaving(true);
      try {
        await once.current.run(requestId, async () => {
          // Cố tình KHÔNG dùng capWait ở đây. capWait bỏ promise thật, nên mất
          // hàm undo. Luồng giọng nói vừa gọi server xong nên chắc chắn có mạng.
          const done = await Promise.race([
            applyVoice(uid, cmd),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('Saving took too long.')), WRITE_TIMEOUT_MS)
            ),
          ]);
          lastCreated.current = { id: done.activityId, at: Date.now() };
          setPending(null);
          setClarify(null);
          push(done.message, {
            label: 'Undo',
            run: () => {
              // Sửa xong lại Undo thì record cũ vẫn còn đó, đừng trỏ vào bản đã bỏ.
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

  /** Người dùng sửa trong thẻ rồi bấm Confirm. */
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
   * Quyết định xong thì làm. `asked` = đã hỏi lại một lần rồi, lần này bí thì
   * mở sheet nhập tay chứ không hỏi vòng hai.
   */
  const runPlan = useCallback(
    async (cmd: ParsedCommand, requestId: string, asked: boolean, onManual: () => void) => {
      const plan = planVoice(cmd, {
        active,
        lastCreatedId: lastCreatedId(),
        asked,
      });

      if (plan.kind === 'commit') {
        // `plan.cmd`, không phải `cmd`: planVoice có thể đã điền targetActivityId.
        setClarify(null);
        await commit(plan.cmd, requestId);
      } else if (plan.kind === 'confirm') {
        setClarify(null);
        setPending({ cmd: plan.cmd, missing: plan.missing, requestId });
      } else if (plan.kind === 'clarify') {
        setClarify({
          question: cmd.clarifyQuestion ?? 'Which one did you mean?',
          options: cmd.clarifyOptions ?? [],
          transcript: cmd.transcript,
          requestId,
        });
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
          push(body?.error ?? 'Voice failed. Try again.');
          return;
        }

        await runPlan(body, requestId, false, onManual);
      } catch (e) {
        push(`Voice failed. ${msg(e)}`);
      } finally {
        setThinking(false);
      }
    },
    [uid, push, runPlan]
  );

  /**
   * Bấm một nút trong câu hỏi. Gửi lựa chọn về cho parser đọc lại cùng câu gốc —
   * chỉ nó mới biết "10:00 PM" là intent gì. Giữ nguyên requestId để một câu nói
   * vẫn chỉ ghi được một record.
   */
  const answerClarify = useCallback(
    async (option: string, onManual: () => void) => {
      const asking = clarify;
      if (!uid || asking === null) return;

      const said = asking.transcript ? `"${asking.transcript}"` : 'The last utterance';
      const text = `${said} — asked "${asking.question}", the user answered "${option}". Emit the final command now.`;

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
