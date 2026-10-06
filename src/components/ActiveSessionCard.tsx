'use client';

import { useElapsed } from '@/hooks/useActivities';
import { useTap } from '@/hooks/useTap';
import { clockTime } from '@/lib/datetime';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

/** 2:41:07 - always derived from seconds, never accumulated. */
function hms(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ActiveSessionCard({
  activity,
  onStop,
  onEdit,
  busy,
  pending = false,
  compact = false,
}: {
  activity: Activity;
  onStop: () => void;
  /** Tap on the card body - opens RecordSheet to edit the start time / label. */
  onEdit?: () => void;
  busy: boolean;
  /** The write is still queued, not on the server yet. */
  pending?: boolean;
  /**
   * From 3 parallel sessions up, the card collapses to a 56px row
   * (AMENDMENT-remove-sleep 6b). The goal is the whole Now screen fitting one
   * screen - no scrolling, no mistaps.
   */
  compact?: boolean;
}) {
  const elapsed = useElapsed(activity.startAt);
  const color = CATEGORY_COLOR[activity.category];
  // The Stop button sits outside the tap area, so no need to stop bubbling,
  // and no <button> inside a <button>.
  const tap = useTap(busy ? undefined : onEdit);
  const hint = onEdit ? `${CATEGORY_LABEL[activity.category]} running, tap to edit` : undefined;

  if (compact) {
    return (
      <div
        id={`session-${activity.category}`}
        className="flex h-14 items-center gap-2 rounded-md border border-l-4 border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900"
        style={{ borderLeftColor: color }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2" aria-label={hint} {...tap}>
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">
            {CATEGORY_LABEL[activity.category]}
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{hms(elapsed)}</span>
          <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
            since {clockTime(activity.startAt)}
          </span>
          {pending ? (
            <span
              title="Waiting to sync"
              aria-label="Waiting to sync"
              role="img"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted"
            />
          ) : null}
        </div>
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50 dark:border-zinc-700"
        >
          Stop
        </button>
      </div>
    );
  }

  return (
    <div
      id={`session-${activity.category}`}
      className="flex items-center gap-3 rounded-md border border-l-4 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      style={{ borderLeftColor: color }}
    >
      <div className="min-w-0 flex-1" aria-label={hint} {...tap}>
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
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted"
            />
          ) : null}
        </div>

        {activity.label ? (
          <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
            {activity.label}
          </p>
        ) : null}

        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
          Started {clockTime(activity.startAt)}
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
