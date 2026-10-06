'use client';

import { useState } from 'react';

import { resolveClockTime, relativeLabel, toClockInput, type ClockDir } from '@/lib/clock';
import { clockTime } from '@/lib/datetime';
import { CATEGORY_LABEL, type Category } from '@/types/logi';

// -----------------------------------------------------------------------------
// logi - "When did it start" (long-press a category button)
//
// Three ways into the same question, ordered by how often they are used:
//   1. offset chips   - opened the app at 7:30, really started at 7:15
//   2. exact time     - you remember it exactly, or it was over an hour ago
//   3. After          - schedule ahead, saved with status 'scheduled'
//
// Chips commit AT ONCE, no confirm step: the toast has a 5-second Undo anyway.
// The exact time needs a button tap - typing a time is easy to get wrong.
//
// Every time label reads the `now` prop, not `Date.now()`. So the label shown
// and the time actually saved never disagree.
// -----------------------------------------------------------------------------

/** Four familiar offsets. Beyond an hour, typing the time beats counting chips. */
const OFFSETS = [5, 15, 30, 60] as const;

export interface StartWhen {
  /** `null` = start right now. */
  startAt: number | null;
  /** `true` → save `status: 'scheduled'`, for `promoteScheduled()` to start later. */
  scheduled: boolean;
}

const offsetLabel = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`);

export default function StartWhenSheet({
  category,
  now,
  onPick,
  onClose,
}: {
  category: Category;
  /** The page's "now". Only moves each minute - enough for an estimate. */
  now: number;
  onPick: (when: StartWhen) => void;
  onClose: () => void;
}) {
  const [dir, setDir] = useState<ClockDir>('past');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => toClockInput(now));

  const past = dir === 'past';
  const sign = past ? -1 : 1;
  const typed = resolveClockTime(text, now, dir);

  const commit = (startAt: number) => onPick({ startAt, scheduled: !past });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Start ${CATEGORY_LABEL[category]} at a different time`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-lg bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Start {CATEGORY_LABEL[category]}</h2>

        {/* Before / After. Before is the default since "forgot to tap" beats "planned ahead". */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-sm bg-surface-1 p-1">
          {(['past', 'future'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dir === d}
              onClick={() => setDir(d)}
              className={[
                'min-h-10 rounded-sm text-sm transition',
                dir === d
                  ? 'border border-line-strong bg-surface-2 font-medium text-ink'
                  : 'text-ink-soft',
              ].join(' ')}
            >
              {d === 'past' ? 'Before' : 'After'}
            </button>
          ))}
        </div>

        {/* Line 2 of each chip is the real time, so no mental subtraction. */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {OFFSETS.map((m) => {
            const ts = now + sign * m * 60_000;
            return (
              <button
                key={m}
                type="button"
                onClick={() => commit(ts)}
                aria-label={`${offsetLabel(m)} ${past ? 'ago' : 'from now'}, ${clockTime(ts)}`}
                className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line active:scale-[0.99]"
              >
                <span className="text-sm font-medium">{offsetLabel(m)}</span>
                <span className="text-xs tabular-nums text-ink-muted">{clockTime(ts)}</span>
              </button>
            );
          })}
        </div>

        {open ? (
          <div className="mt-3 rounded-sm border border-line p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">
                {past ? 'Started at' : 'Starting at'}
              </span>
              <input
                type="time"
                value={text}
                autoFocus
                onChange={(e) => setText(e.target.value)}
                aria-invalid={typed === null}
                className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
              />
            </label>

            {/* Live confirmation: which day, how long from now. This is where users
                catch that they just typed into the night before. */}
            <p className="mt-2 min-h-5 text-xs tabular-nums text-ink-muted">
              {typed === null ? '·' : `${clockTime(typed)} · ${relativeLabel(typed, now)}`}
            </p>

            <button
              type="button"
              disabled={typed === null}
              onClick={() => typed !== null && commit(typed)}
              className="mt-2 min-h-11 w-full rounded-sm bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 active:scale-[0.99] disabled:opacity-40"
            >
              {past ? 'Start' : 'Schedule'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 min-h-11 w-full rounded-sm text-sm text-ink-soft"
          >
            Specific time…
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
