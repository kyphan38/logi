'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { minutesLabel, type RoutineDayGroup } from '@/lib/routine';
import { MOVE_LIMIT_PX, isRealTap, type Press } from '@/lib/tap-guard';
import type { RoutineItem } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Today's routine on the Now screen (Stage 10)
//
// Below the 4-button grid. Collapsed to one "Routine 3/8" row by default so
// Now stays short; tapping it opens the whole day. One block per group:
// title + a "2/3" count, then one row per item with a checkbox. Tap again to
// untick. No Undo: a mistap is undone by tapping again. An item with a
// category gets a Start button that runs it as a session.
//
// Taps share the scroll mistap guard with the button grid - this list is
// long, so a swipe ending on a row is common.
// ---------------------------------------------------------------------------

export default function RoutineChecklist({
  groups,
  isChecked,
  onToggle,
  runningIds,
  busy,
  onStart,
}: {
  groups: RoutineDayGroup[];
  isChecked: (itemId: string) => boolean;
  onToggle: (itemId: string) => void;
  /** Items with a session running now. */
  runningIds: ReadonlySet<string>;
  busy: boolean;
  onStart: (item: RoutineItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const down = useRef<{ x: number; y: number; at: number; id: string } | null>(null);
  const lastScrollAt = useRef<number | null>(null);
  // Items ticked while the page is open. Only these animate; a list that
  // loads already ticked just shows its marks.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const toggle = useCallback(
    (id: string) => {
      setTouched((t) => (t.has(id) ? t : new Set(t).add(id)));
      onToggle(id);
    },
    [onToggle],
  );

  useEffect(() => {
    const onScroll = (e: Event) => {
      lastScrollAt.current = e.timeStamp;
      down.current = null;
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const pressStart = useCallback((id: string, e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, id };
  }, []);

  const pressMove = useCallback((e: React.PointerEvent) => {
    const d = down.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_LIMIT_PX) down.current = null;
  }, []);

  const press = useCallback(
    (id: string, e: React.PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || d.id !== id) return;
      const p: Press = {
        downX: d.x,
        downY: d.y,
        downAt: d.at,
        upX: e.clientX,
        upY: e.clientY,
        upAt: e.timeStamp,
        lastScrollAt: lastScrollAt.current,
      };
      if (isRealTap(p)) toggle(id);
    },
    [toggle]
  );

  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const doneAll = groups.reduce((n, g) => n + g.done, 0);
  // Planned time of today's items. Items with no length add nothing.
  const totalMin = groups.reduce(
    (n, g) => n + g.items.reduce((m, it) => m + (it.minutes ?? 0), 0),
    0
  );

  return (
    <section aria-label="Today's routine" className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-my-2 flex min-h-11 items-center justify-between gap-3 px-1 text-left"
      >
        <span className="text-xs text-ink-soft">
          <span className="font-semibold uppercase tracking-wide">Routine</span>
          {totalMin > 0 ? (
            <span className="tabular-nums text-ink-muted"> · {minutesLabel(totalMin)}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-ink-muted">
          {doneAll}/{total}
          <svg
            viewBox="0 0 16 16"
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && groups.map(({ group, items, done }) => {
        const complete = done === items.length;
        const acted = items.some((it) => touched.has(it.id));
        return (
          <div key={group.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {group.title}
              </h2>
              <span
                // A new key replays `pop` once when the group becomes complete.
                key={complete ? 'complete' : 'open'}
                className={[
                  'inline-block shrink-0 text-xs tabular-nums',
                  complete ? 'font-medium text-ink' : 'text-ink-muted',
                  complete && acted ? 'pop' : '',
                ].join(' ')}
              >
                {done}/{items.length}
              </span>
            </div>

            <ul className="flex flex-col border-y border-line">
              {items.map((item, i) => {
                const on = isChecked(item.id);
                const moved = touched.has(item.id);
                return (
                  <li
                    key={item.id}
                    className={['flex items-center', i > 0 ? 'border-t border-line' : ''].join(' ')}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onPointerDown={(e) => pressStart(item.id, e)}
                      onPointerMove={pressMove}
                      onPointerUp={(e) => press(item.id, e)}
                      onPointerCancel={() => (down.current = null)}
                      onKeyDown={(e) => {
                        // The keyboard does not go through pointer events.
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggle(item.id);
                        }
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                      className="flex min-h-11 min-w-0 flex-1 select-none items-center gap-3 px-1 text-left touch-manipulation transition active:bg-surface-2"
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border',
                          on ? 'border-ink bg-ink text-[var(--surface-0)]' : 'border-line-strong',
                        ].join(' ')}
                      >
                        {on ? (
                          <svg
                            viewBox="0 0 16 16"
                            className={`h-3.5 w-3.5 ${moved ? 'pop' : ''}`}
                            fill="none"
                          >
                            <path
                              d="M3.5 8.5l3 3 6-7"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span
                        className={['min-w-0 flex-1 text-sm', on ? 'text-ink-muted' : 'text-ink'].join(' ')}
                      >
                        {/* The strike grows across the text itself, not the whole row. */}
                        <span className="relative">
                          {item.text}
                          <span
                            aria-hidden="true"
                            className="strike"
                            data-on={on}
                            data-instant={moved ? undefined : 'true'}
                          />
                        </span>
                      </span>
                      {item.minutes ? (
                        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                          {minutesLabel(item.minutes)}
                        </span>
                      ) : null}
                    </button>
                    {item.category && !on ? (
                      runningIds.has(item.id) ? (
                        <span className="flex min-h-11 shrink-0 items-center px-3 text-xs font-medium text-ink-soft">
                          Running
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStart(item)}
                          disabled={busy}
                          aria-label={`Start ${item.text}`}
                          className="ml-1 min-h-9 shrink-0 rounded-md border border-line-strong px-3 text-xs font-medium text-ink-soft transition active:scale-[0.97] disabled:opacity-40"
                        >
                          Start
                        </button>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
