'use client';

import MoonIcon from '@/components/MoonIcon';
import TopBar from '@/components/TopBar';
import { formatBedtime } from '@/lib/bedtime';
import { formatDuration, prettyDay } from '@/lib/datetime';

/**
 * Title and gear on top. Date, hours, bedtime and (in the evening) "today"
 * share one quiet line below, so the gear never has to share its corner.
 */
export default function NowHeader({
  today,
  trackedMs,
  bedtimeAt,
  busy,
  showToday,
  bedtimeHint,
  onBedtime,
  onToday,
}: {
  today: string;
  trackedMs: number;
  bedtimeAt: number | null;
  busy: boolean;
  showToday: boolean;
  /** G10: a faint line from 30 minutes before the planned bedtime. */
  bedtimeHint?: string | null;
  onBedtime: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex flex-col">
      <TopBar>
        <h1 className="text-2xl font-semibold tracking-tight">Now</h1>
      </TopBar>
      <p className="flex min-h-11 flex-wrap items-center gap-2 text-sm tabular-nums text-ink-muted">
        <span>{prettyDay(today)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDuration(trackedMs)} tracked</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onBedtime}
          disabled={busy}
          aria-label={bedtimeAt ? `Bedtime ${formatBedtime(bedtimeAt)}, tap to edit` : 'Log bedtime'}
          className="transition hover:text-ink active:scale-95 active:text-ink disabled:opacity-50"
        >
          <MoonIcon /> {bedtimeAt ? formatBedtime(bedtimeAt) : 'bedtime'}
        </button>
        {showToday ? (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onToday}
              className="transition hover:text-ink active:scale-95 active:text-ink"
            >
              today
            </button>
          </>
        ) : null}
      </p>
      {bedtimeHint ? <p className="text-sm text-ink-soft">{bedtimeHint}</p> : null}
    </div>
  );
}
