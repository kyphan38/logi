'use client';

import { useState } from 'react';

import { resolveClockOnDate, toClockInput } from '@/lib/clock';
import { formatBedtime } from '@/lib/bedtime';
import type { DayLog } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - "What time did I go to bed that night" (History)
//
// Sibling of `BedtimeSheet` on Now, differing in exactly one way, which is why
// it exists: THE DAY IS GIVEN, from the History day picker.
//
// The Now sheet derives the day from the time ("latest in the past"), so it
// never reaches beyond 24 hours - forget two nights and there is no way back.
// Here the day is already known, so only the time is attached to that night.
//
// Still NO date field in the sheet: picking the day is the day bar's job above;
// asking again would let two places disagree.
// ---------------------------------------------------------------------------

/** Usual bedtimes. Four cells in a row; the last two cross midnight. */
const CHIPS = ['22:00', '23:00', '00:00', '01:00'] as const;

/** '2026-09-05' → 'Fri, Sep 5'. The weekday is what tells which night. */
function nightLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** epoch → 'Sat, Sep 6'. The mark's CALENDAR day, not its logical day. */
function stampLabel(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function DayBedtimeSheet({
  date,
  log,
  busy,
  onPick,
  onClear,
  onClose,
}: {
  /** The logical day viewed in History - the night it will be saved to. */
  date: string;
  /** The existing mark of that day. */
  log: DayLog;
  busy: boolean;
  onPick: (at: number) => void;
  onClear: (date: string) => void;
  onClose: () => void;
}) {
  const current = log.bedtimeAt;
  // With an existing mark, open at that time: changing 23:10 to 23:40 needs no
  // retyping. Without one, 23:00 saves some number dragging.
  const [text, setText] = useState(() => (current === null ? '23:00' : toClockInput(current)));
  const typed = resolveClockOnDate(text, date);

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
        {/* Say plainly which night is being edited. The sheet opens from the
            header, which scrolls away - without this line it is easy to save
            onto the wrong day. */}
        <p className="mt-0.5 text-xs text-ink-muted">Night of {nightLabel(date)}</p>

        <div className="mt-3 flex min-h-11 items-center gap-3 rounded-sm border border-line bg-surface-1 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">Logged</span>
          <span className="shrink-0 tabular-nums">
            {current === null ? '-' : formatBedtime(current)}
          </span>
          {current === null ? null : (
            <button
              type="button"
              onClick={() => onClear(date)}
              disabled={busy}
              aria-label="Clear bedtime"
              className="min-h-11 shrink-0 px-1 text-ink-soft transition active:scale-95 disabled:opacity-40"
            >
              ×
            </button>
          )}
        </div>

        {/* Line 2 of each cell is the mark's CALENDAR day. 00:00 and 01:00 fall on
            the next day but still belong to this night - written out, no trust needed. */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {CHIPS.map((hhmm) => {
            const ts = resolveClockOnDate(hhmm, date);
            if (ts === null) return null;
            return (
              <button
                key={hhmm}
                type="button"
                onClick={() => onPick(ts)}
                disabled={busy}
                aria-label={`${hhmm} on ${stampLabel(ts)}`}
                className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line transition active:scale-[0.99] disabled:opacity-40"
              >
                <span className="text-sm font-medium tabular-nums">{hhmm}</span>
                <span className="text-xs text-ink-muted">{stampLabel(ts).split(',')[0]}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-sm border border-line p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft">Went to bed at</span>
            <input
              type="time"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={typed === null}
              className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
            />
          </label>
          <p className="mt-2 min-h-5 text-xs tabular-nums text-ink-muted">
            {typed === null ? '-' : stampLabel(typed)}
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
