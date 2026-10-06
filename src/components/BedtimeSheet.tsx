'use client';

import { useState } from 'react';

import { resolveClockTime, toClockInput } from '@/lib/clock';
import { logicalDate } from '@/lib/balance';
import { formatBedtime } from '@/lib/bedtime';
import { formatDuration } from '@/lib/datetime';
import type { DayLog } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - "What time did I go to bed" (Stage 8)
//
// The old bedtime button wrote `Date.now()` directly. Remembering at 7:30 am
// put the mark on this morning, a whole night off; and a mistake could not
// be deleted.
//
// This sheet shows BOTH recent nights, because at 7:30 am "last night" and
// "tonight" are two different logical days - seeing them settles it. The time
// always goes back into the past; 00:00 or 01:00 still belongs to the night
// before, the 04:00 cut handles that.
// ---------------------------------------------------------------------------

/** Usual bedtimes. Four cells in a row like the Start sheet; the first is "Now". */
const CHIPS = ['22:00', '23:00', '00:00'] as const;

/** '2026-09-05' → 'Fri, Sep 5'. The weekday is what tells which night. */
function nightLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function BedtimeSheet({
  tonight,
  lastNight,
  now,
  busy,
  onPick,
  onClear,
  onClose,
}: {
  /** Today's logical day - the coming night. */
  tonight: DayLog;
  /** Yesterday's logical day - last night. */
  lastNight: DayLog;
  now: number;
  busy: boolean;
  onPick: (at: number) => void;
  onClear: (date: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => toClockInput(now));
  const typed = resolveClockTime(text, now, 'past');

  const rows = [
    { label: 'Last night', log: lastNight },
    { label: 'Tonight', log: tonight },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Bedtime"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-lg bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Bedtime</h2>

        {/* The two latest nights. The only place a mistaken mark can be deleted. */}
        <div className="mt-3 rounded-sm border border-line bg-surface-1">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex min-h-11 items-center gap-3 px-3 py-2 text-sm ${
                i > 0 ? 'border-t border-line' : ''
              }`}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.label}</span>
                <span className="text-ink-muted"> · {nightLabel(r.log.date)}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {r.log.bedtimeAt === null ? '-' : formatBedtime(r.log.bedtimeAt)}
              </span>
              {r.log.bedtimeAt === null ? null : (
                <button
                  type="button"
                  onClick={() => onClear(r.log.date)}
                  disabled={busy}
                  aria-label={`Clear ${r.label.toLowerCase()} bedtime`}
                  className="min-h-11 shrink-0 px-1 text-ink-soft transition active:scale-95 disabled:opacity-40"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Line 1 is the time, line 2 is "how long ago" - no subtraction when
            half asleep. */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onPick(now)}
            disabled={busy}
            className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line transition active:scale-[0.99] disabled:opacity-40"
          >
            <span className="text-sm font-medium">Now</span>
            <span className="text-xs tabular-nums text-ink-muted">{toClockInput(now)}</span>
          </button>
          {CHIPS.map((hhmm) => {
            const ts = resolveClockTime(hhmm, now, 'past');
            if (ts === null) return null;
            return (
              <button
                key={hhmm}
                type="button"
                onClick={() => onPick(ts)}
                disabled={busy}
                aria-label={`${hhmm}, ${formatDuration(now - ts)} ago`}
                className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line transition active:scale-[0.99] disabled:opacity-40"
              >
                <span className="text-sm font-medium tabular-nums">{hhmm}</span>
                <span className="text-xs tabular-nums text-ink-muted">
                  {formatDuration(now - ts)}
                </span>
              </button>
            );
          })}
        </div>

        {open ? (
          <div className="mt-3 rounded-sm border border-line p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Went to bed at</span>
              <input
                type="time"
                value={text}
                autoFocus
                onChange={(e) => setText(e.target.value)}
                aria-invalid={typed === null}
                className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
              />
            </label>
            {/* Say which night the mark lands on: 01:00 is the night before,
                not this morning. */}
            <p className="mt-2 min-h-5 text-xs tabular-nums text-ink-muted">
              {typed === null
                ? '-'
                : `${formatDuration(now - typed)} ago · night of ${nightLabel(logicalDate(typed))}`}
            </p>
            <button
              type="button"
              disabled={busy || typed === null}
              onClick={() => typed !== null && onPick(typed)}
              className="mt-2 min-h-11 w-full rounded-sm bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 transition active:scale-[0.99] disabled:opacity-40"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 min-h-11 w-full rounded-sm text-sm text-ink-soft"
          >
            Specific time
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-1 min-h-11 w-full rounded-sm text-sm text-ink-soft"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
