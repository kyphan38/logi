'use client';

import { useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { capWait } from '@/hooks/useActivities';
import { stopActivity, updateActivity } from '@/lib/activities';
import { suggestedEndTimes } from '@/lib/balance';
import { toLocalInput } from '@/lib/datetime';
import { CATEGORY_LABEL, MAX_SESSION_MIN, type Activity } from '@/types/logi';
import { btn } from '@/lib/ui';

const MAX_SESSION_MS = MAX_SESSION_MIN * 60_000;

function startedLine(a: Activity, now: number): string {
  const d = new Date(a.startAt);
  const when = d.toLocaleString([], {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  const hours = Math.round((now - a.startAt) / 3_600_000);
  return `${CATEGORY_LABEL[a.category].toUpperCase()} started ${when} - ${hours} hours ago.`;
}

export default function StaleSessionModal({
  activity,
  now,
  remaining,
  onResolved,
}: {
  activity: Activity;
  now: number;
  /** How many stale sessions remain after this one. */
  remaining: number;
  onResolved: () => void;
}) {
  const { uid } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<string | null>(null);

  // The last valid time: no more than 15h after startAt, and not in the future.
  const maxTs = Math.min(now, activity.startAt + MAX_SESSION_MS);

  // Drop suggestions `validateTimes` would reject (over 15h or before the start).
  const suggestions = useMemo(
    () => suggestedEndTimes(activity).filter((s) => s.ts > activity.startAt && s.ts <= maxTs),
    [activity, maxTs],
  );

  async function run(fn: () => Promise<unknown>) {
    if (!uid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Offline: the write is queued, the modal must still close.
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
    // Cannot close by tapping outside - it must be handled.
    <div
      className="fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-title"
    >
      <div className="pop w-full max-w-sm rounded-lg bg-surface-2 p-5">
        <h2 id="stale-title" className="text-lg font-semibold tracking-tight">
          Unfinished session
        </h2>

        <p className="mt-3 text-sm text-ink-soft">
          {startedLine(activity, now)}
        </p>
        {activity.label ? (
          <p className="mt-1 text-sm text-ink-muted">{activity.label}</p>
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
                className="min-h-11 flex-1 rounded-md border border-line px-3 text-sm font-medium active:scale-[0.98] disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => setCustom(toLocalInput(maxTs))}
              className="min-h-11 flex-1 rounded-md border border-line px-3 text-sm font-medium active:scale-[0.98] disabled:opacity-50"
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
              className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCustom(null)}
                className="min-h-11 flex-1 rounded-md border border-line text-sm disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveCustom}
                className={`${btn('primary')} flex-1`}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-ink">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void discard()}
          className="mt-4 min-h-11 w-full rounded-md text-sm text-ink-muted hover:text-ink active:text-ink disabled:opacity-50"
        >
          Discard this session
        </button>

        {remaining > 0 ? (
          <p className="mt-3 text-center text-xs text-ink-muted">
            {remaining} more unfinished session{remaining > 1 ? 's' : ''} after this
          </p>
        ) : null}
      </div>
    </div>
  );
}
