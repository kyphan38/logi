'use client';

import { useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { capWait } from '@/hooks/useActivities';
import { stopActivity, updateActivity } from '@/lib/activities';
import { suggestedEndTimes } from '@/lib/balance';
import { toLocalInput } from '@/lib/datetime';
import { CATEGORY_LABEL, MAX_SESSION_MIN, type Activity } from '@/types/logi';

const MAX_SESSION_MS = MAX_SESSION_MIN * 60_000;

function startedLine(a: Activity, now: number): string {
  const d = new Date(a.startAt);
  const when = d.toLocaleString([], {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  const hours = Math.round((now - a.startAt) / 3_600_000);
  return `${CATEGORY_LABEL[a.category].toUpperCase()} started ${when} — ${hours} hours ago.`;
}

export default function StaleSessionModal({
  activity,
  now,
  remaining,
  onResolved,
}: {
  activity: Activity;
  now: number;
  /** Còn bao nhiêu session stale nữa sau cái này. */
  remaining: number;
  onResolved: () => void;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<string | null>(null);

  // Giờ hợp lệ cuối cùng: không quá 15h sau startAt, và không ở tương lai.
  const maxTs = Math.min(now, activity.startAt + MAX_SESSION_MS);

  // Bỏ các gợi ý sẽ bị `validateTimes` từ chối (quá 15h hoặc trước lúc bắt đầu).
  const suggestions = useMemo(
    () => suggestedEndTimes(activity).filter((s) => s.ts > activity.startAt && s.ts <= maxTs),
    [activity, maxTs],
  );

  async function run(fn: () => Promise<unknown>) {
    if (!uid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Offline: write nằm trong hàng đợi, modal vẫn phải đóng được.
      await capWait(fn(), () => undefined);
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const stopAt = (ts: number) => run(() => stopActivity(uid!, activity.id, ts));
  const discard = () => run(() => updateActivity(uid!, activity.id, { status: 'abandoned' }));

  function saveCustom() {
    if (!custom) return;
    const ts = new Date(custom).getTime();
    if (!Number.isFinite(ts)) {
      setError('Invalid time.');
      return;
    }
    void stopAt(ts);
  }

  return (
    // Không đóng được bằng cách bấm ra ngoài — bắt buộc phải xử lý.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-title"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 dark:bg-zinc-900">
        <h2 id="stale-title" className="text-lg font-semibold tracking-tight">
          Unfinished session
        </h2>

        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          {startedLine(activity, now)}
        </p>
        {activity.label ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{activity.label}</p>
        ) : null}
        <p className="mt-2 text-sm font-medium">When did you actually stop?</p>

        {custom === null ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.ts}
                type="button"
                disabled={busy}
                onClick={() => void stopAt(s.ts)}
                className="min-h-11 flex-1 rounded-md border border-zinc-200 px-3 text-sm font-medium active:scale-[0.98] disabled:opacity-50 dark:border-zinc-800"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => setCustom(toLocalInput(maxTs))}
              className="min-h-11 flex-1 rounded-md border border-zinc-200 px-3 text-sm font-medium active:scale-[0.98] disabled:opacity-50 dark:border-zinc-800"
            >
              Custom…
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <input
              type="datetime-local"
              value={custom}
              min={toLocalInput(activity.startAt)}
              max={toLocalInput(maxTs)}
              onChange={(e) => setCustom(e.target.value)}
              className="min-h-11 w-full rounded-md border border-zinc-200 px-3 text-base dark:border-zinc-800 dark:bg-zinc-900"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCustom(null)}
                className="min-h-11 flex-1 rounded-md border border-zinc-200 text-sm disabled:opacity-50 dark:border-zinc-800"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveCustom}
                className="min-h-11 flex-1 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void discard()}
          className="mt-4 min-h-11 w-full rounded-md text-sm text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50 dark:text-zinc-400"
        >
          Discard this session
        </button>

        {remaining > 0 ? (
          <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
            {remaining} more unfinished session{remaining > 1 ? 's' : ''} after this
          </p>
        ) : null}
      </div>
    </div>
  );
}
