'use client';

import { useElapsed } from '@/hooks/useActivities';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

/** 2:41:07 — luôn derive từ số giây, không cộng dồn. */
function hms(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ActiveSessionCard({
  activity,
  onStop,
  busy,
  pending = false,
}: {
  activity: Activity;
  onStop: () => void;
  busy: boolean;
  /** Ghi còn nằm trong hàng đợi, chưa lên server. */
  pending?: boolean;
}) {
  const elapsed = useElapsed(activity.startAt);
  const color = CATEGORY_COLOR[activity.category];

  return (
    <div
      id={`session-${activity.category}`}
      className="flex items-center gap-3 rounded-md border border-l-4 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      style={{ borderLeftColor: color }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold uppercase tracking-wide">
            {CATEGORY_LABEL[activity.category]}
          </span>
          {pending ? (
            <span
              title="Waiting to sync"
              aria-label="Waiting to sync"
              role="img"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            />
          ) : null}
        </div>

        {activity.label ? (
          <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
            {activity.label}
          </p>
        ) : null}

        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
          Started {clock(activity.startAt)}
        </p>

        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{hms(elapsed)}</p>
      </div>

      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        className="min-h-11 min-w-11 shrink-0 rounded-lg border border-zinc-300 px-4 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50 dark:border-zinc-700"
      >
        Stop
      </button>
    </div>
  );
}
