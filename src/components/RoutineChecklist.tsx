'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RoutineDayGroup } from '@/lib/routine';
import { MOVE_LIMIT_PX, isRealTap, type Press } from '@/lib/tap-guard';

// ---------------------------------------------------------------------------
// logi - Today's routine on the Now screen (Stage 10)
//
// Below the 4-button grid. One block per group: title + a "2/3" count, then
// one row per item with a checkbox. Tap again to untick. No Undo: a mistap
// is undone by tapping again.
//
// Taps share the scroll mistap guard with the button grid - this list is
// long, so a swipe ending on a row is common.
// ---------------------------------------------------------------------------

export default function RoutineChecklist({
  groups,
  isChecked,
  onToggle,
}: {
  groups: RoutineDayGroup[];
  isChecked: (itemId: string) => boolean;
  onToggle: (itemId: string) => void;
}) {
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

  return (
    <section aria-label="Today's routine" className="flex flex-col gap-4">
      {groups.map(({ group, items, done }) => {
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
                  <li key={item.id} className={i > 0 ? 'border-t border-line' : undefined}>
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
                      className="flex min-h-11 w-full select-none items-center gap-3 px-1 text-left touch-manipulation transition active:bg-surface-2"
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
                    </button>
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
