'use client';

import { useCallback, useEffect, useRef } from 'react';

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
      if (isRealTap(p)) onToggle(id);
    },
    [onToggle]
  );

  if (groups.length === 0) return null;

  return (
    <section aria-label="Today's routine" className="flex flex-col gap-4">
      {groups.map(({ group, items, done }) => (
        <div key={group.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {group.title}
            </h2>
            <span
              className={[
                'shrink-0 text-xs tabular-nums',
                done === items.length ? 'font-medium text-ink' : 'text-ink-muted',
              ].join(' ')}
            >
              {done}/{items.length}
            </span>
          </div>

          <ul className="flex flex-col overflow-hidden rounded-md border border-line bg-surface-1">
            {items.map((item, i) => {
              const on = isChecked(item.id);
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
                        onToggle(item.id);
                      }
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    className="flex min-h-11 w-full select-none items-center gap-3 px-3 text-left touch-manipulation transition active:bg-surface-2"
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border',
                        on ? 'border-ink bg-ink text-[var(--surface-0)]' : 'border-line-strong',
                      ].join(' ')}
                    >
                      {on ? (
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
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
                      className={[
                        'min-w-0 flex-1 text-sm',
                        on ? 'text-ink-muted line-through' : 'text-ink',
                      ].join(' ')}
                    >
                      {item.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
