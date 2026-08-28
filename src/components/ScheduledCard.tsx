'use client';

import { useTick } from '@/hooks/useActivities';
import { countdown } from '@/lib/datetime';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Session đã hẹn giờ, chưa chạy (Task 6). Nằm phía trên các session đang chạy
 * trong màn hình Now.
 *
 * Tới giờ mà `promoteScheduled()` chưa kịp ghi xong thì hiện "starting…" - card
 * tự biến mất khi record đổi sang `active`.
 */
export default function ScheduledCard({
  activity,
  onCancel,
  busy,
  pending = false,
}: {
  activity: Activity;
  onCancel: () => void;
  busy: boolean;
  /** Ghi còn nằm trong hàng đợi, chưa lên server. */
  pending?: boolean;
}) {
  const now = useTick(1000, true);
  const left = activity.startAt - now;
  const color = CATEGORY_COLOR[activity.category];

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-l-4 border-dashed border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      style={{ borderLeftColor: color }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border-2"
            style={{ borderColor: color }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
          Starts at {clock(activity.startAt)}
        </p>

        <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
          {left > 0 ? `starts in ${countdown(left)}` : 'starting…'}
        </p>
      </div>

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="min-h-11 min-w-11 shrink-0 rounded-lg border border-zinc-300 px-4 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50 dark:border-zinc-700"
      >
        Cancel
      </button>
    </div>
  );
}
