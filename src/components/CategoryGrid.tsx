'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { catInk, catTint } from '@/lib/category-style';
import type { NowTile } from '@/lib/day-progress';
import { MOVE_LIMIT_PX, isRealTap, type Press } from '@/lib/tap-guard';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

import StartWhenSheet, { type StartWhen } from './StartWhenSheet';

// -----------------------------------------------------------------------------
// logi - The grid of 4 Start buttons (AMENDMENT-remove-sleep 6b + 6c)
//
// The button itself is the gauge: each has a 3px strip at the bottom edge,
// comparing today's hours with THAT day's target. No extra line, yet you see
// which one is short.
//
// Start stays ONE tap - no confirm, no long-press. Mistap protection lives in
// `isRealTap()`, not in a confirmation step.
// -----------------------------------------------------------------------------

/** Held longer than `isRealTap`'s threshold → open the time sheet, not Start. */
const LONG_PRESS_MS = 500;

/** The strong ink segment at the right edge when over target (gray only, DESIGN.md). */
const OVER_PCT = 14;
const OVER_COLOR = 'var(--text-primary)';

export default function CategoryGrid({
  tiles,
  running,
  busy,
  now,
  onStart,
  onFocusRunning,
  onEditRunning,
}: {
  /** Today's progress for all 4 categories, in CATEGORIES order. */
  tiles: NowTile[];
  running: Set<Category>;
  busy: boolean;
  /** The page's "now", so time labels in the sheet match the recorded time. */
  now: number;
  onStart: (category: Category, when: StartWhen) => void;
  onFocusRunning: (category: Category) => void;
  /**
   * Long-press on a RUNNING button. `Before` on a running category always throws
   * `duplicate`, so the real intent is almost always "I started at the wrong time".
   */
  onEditRunning: (category: Category) => void;
}) {
  const [sheetFor, setSheetFor] = useState<Category | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const down = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastScrollAt = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  // Layer 2 of 6c: right after a scroll every tap is suspect. `capture` catches
  // child container scrolls too, `passive` does not block scrolling.
  // Every time here comes from `event.timeStamp`, not `Date.now()`: one clock
  // (`performance.timeOrigin`), only used for differences, and it does not jump
  // when the system adjusts time while a finger is down.
  useEffect(() => {
    const onScroll = (e: Event) => {
      lastScrollAt.current = e.timeStamp;
      // While scrolling, a long-press is no longer a long-press.
      clear();
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [clear]);

  const pressStart = (c: Category, e: React.PointerEvent) => {
    longFired.current = false;
    down.current = { x: e.clientX, y: e.clientY, at: e.timeStamp };
    clear();
    timer.current = setTimeout(() => {
      longFired.current = true;
      if (running.has(c)) onEditRunning(c);
      else setSheetFor(c);
    }, LONG_PRESS_MS);
  };

  // The finger moved far, so this is a swipe: cancel the long-press too.
  const pressMove = (e: React.PointerEvent) => {
    const d = down.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_LIMIT_PX) clear();
  };

  const cancel = () => {
    clear();
    down.current = null;
  };

  const press = (c: Category, e: React.PointerEvent) => {
    clear();
    const d = down.current;
    down.current = null;
    // The long-press opened the sheet → ignore the click that comes with it.
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    if (!d) return;
    const p: Press = {
      downX: d.x,
      downY: d.y,
      downAt: d.at,
      upX: e.clientX,
      upY: e.clientY,
      upAt: e.timeStamp,
      lastScrollAt: lastScrollAt.current,
    };
    if (!isRealTap(p)) return;
    if (running.has(c)) onFocusRunning(c);
    else onStart(c, { startAt: null, scheduled: false });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => {
          const c = t.category;
          const isRunning = running.has(c);
          return (
            <button
              key={c}
              type="button"
              disabled={busy}
              onPointerDown={(e) => pressStart(c, e)}
              onPointerMove={pressMove}
              onPointerUp={(e) => press(c, e)}
              onPointerLeave={cancel}
              onPointerCancel={cancel}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={
                isRunning
                  ? `${CATEGORY_LABEL[c]} running, ${t.label}, tap to view, hold to edit`
                  : `Start ${CATEGORY_LABEL[c]}, ${t.label}, hold to pick a time`
              }
              className={[
                // A gray HAIRLINE border for every button. Four pastel borders side
                // by side is what made this screen busy - category color shrinks to one dot.
                'relative flex min-h-[72px] select-none flex-col items-start justify-center gap-1',
                'overflow-hidden rounded-md border border-line px-3 py-2 text-left transition md:min-h-[96px]',
                'touch-manipulation active:scale-[0.98] disabled:opacity-50',
                isRunning ? 'text-ink' : 'bg-surface-1 text-ink active:bg-surface-2',
              ].join(' ')}
              style={
                isRunning
                  ? { backgroundColor: catTint(c), borderColor: CATEGORY_COLOR[c], color: catInk(c) }
                  : undefined
              }
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: CATEGORY_COLOR[c] }}
                />
                <span className="text-sm font-medium md:text-base">{CATEGORY_LABEL[c]}</span>
              </span>

              <span className="text-xs tabular-nums text-ink-muted">{t.label}</span>

              {isRunning ? (
                <span className="absolute right-2 top-1.5 text-[10px] opacity-80">running</span>
              ) : (
                // The long-press gesture is not discoverable. A faint mark in the
                // corner is enough to try once, without a second button on the same button.
                <span aria-hidden="true" className="absolute right-2 top-1 text-sm text-ink-muted">
                  ⋯
                </span>
              )}

              {/* Progress strip. No target means NO strip - an empty strip looks
                  like "did nothing", when really no goal was set today. */}
              {t.noTarget ? null : (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2"
                >
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${t.fill * 100}%`,
                      backgroundColor: CATEGORY_COLOR[c],
                    }}
                  />
                  {t.over ? (
                    <span
                      className="absolute inset-y-0 right-0"
                      style={{ width: `${OVER_PCT}%`, backgroundColor: OVER_COLOR }}
                    />
                  ) : null}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sheetFor ? (
        <StartWhenSheet
          category={sheetFor}
          now={now}
          onClose={() => setSheetFor(null)}
          onPick={(when) => {
            const c = sheetFor;
            setSheetFor(null);
            onStart(c, when);
          }}
        />
      ) : null}
    </>
  );
}
