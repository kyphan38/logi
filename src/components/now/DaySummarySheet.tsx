'use client';

import SheetShell from '@/components/SheetShell';
import { useEvents } from '@/hooks/useEvents';
import type { NowTile } from '@/lib/day-progress';
import { routineLine, summaryRows, tomorrowEvents } from '@/lib/day-summary';
import type { RoutineDayGroup } from '@/lib/routine';
import { btn } from '@/lib/ui';

/** G9: the day on one screen. Opens after bedtime; "today" on Now opens it again. */
export default function DaySummarySheet({
  today,
  tiles,
  routine,
  onClose,
}: {
  today: string;
  tiles: NowTile[];
  routine: RoutineDayGroup[];
  onClose: () => void;
}) {
  const { events } = useEvents();
  const rows = summaryRows(tiles);
  const routineDone = routineLine(routine);
  const tomorrow = tomorrowEvents(events, today);

  return (
    <SheetShell
      label="Today"
      onClose={onClose}
      center
      className="w-full max-w-lg rounded-t-lg bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5"
    >
      <h3 className="mb-4 text-base font-semibold text-ink">Today</h3>

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm tabular-nums">
          {rows.map((r) => (
            <li key={r.category} className="flex items-baseline justify-between gap-3">
              <span className="text-ink">{r.name}</span>
              <span className={r.met ? 'text-ink' : 'text-ink-muted'}>
                {r.actual}
                {r.target ? ` / ${r.target}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">Nothing logged.</p>
      )}

      {routineDone ? (
        <p className="mt-4 flex items-baseline justify-between gap-3 text-sm tabular-nums">
          <span className="text-ink">Routine</span>
          <span className="text-ink-muted">{routineDone}</span>
        </p>
      ) : null}

      <div className="mt-5">
        <p className="text-xs text-ink-muted">Tomorrow</p>
        {tomorrow.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {tomorrow.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3">
                <span className="w-12 shrink-0 tabular-nums text-ink-muted">{e.time ?? 'all day'}</span>
                <span className="min-w-0 text-ink">{e.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-ink-muted">No events.</p>
        )}
      </div>

      <button type="button" onClick={onClose} className={`${btn('secondary', 'sm')} mt-6 w-full`}>
        Close
      </button>
    </SheetShell>
  );
}
