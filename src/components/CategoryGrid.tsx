'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

const LONG_PRESS_MS = 500;
const ADJUST_CHOICES = [5, 15, 30] as const;

export default function CategoryGrid({
  running,
  busy,
  onStart,
  onFocusRunning,
}: {
  running: Set<Category>;
  busy: boolean;
  /** minutesAgo = 0 → bắt đầu ngay. */
  onStart: (category: Category, minutesAgo: number) => void;
  onFocusRunning: (category: Category) => void;
}) {
  const [sheetFor, setSheetFor] = useState<Category | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const pressStart = (c: Category) => {
    longFired.current = false;
    clear();
    timer.current = setTimeout(() => {
      longFired.current = true;
      setSheetFor(c);
    }, LONG_PRESS_MS);
  };

  const press = (c: Category) => {
    clear();
    // Long-press đã mở sheet → bỏ qua click phát sinh kèm theo.
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    if (running.has(c)) onFocusRunning(c);
    else onStart(c, 0);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((c, i) => {
          const isRunning = running.has(c);
          const last = i === CATEGORIES.length - 1;
          const odd = CATEGORIES.length % 2 === 1;
          return (
            <button
              key={c}
              type="button"
              disabled={busy}
              onPointerDown={() => pressStart(c)}
              onPointerUp={() => press(c)}
              onPointerLeave={clear}
              onPointerCancel={clear}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={
                isRunning
                  ? `${CATEGORY_LABEL[c]} running, tap to view`
                  : `Start ${CATEGORY_LABEL[c]}`
              }
              className={[
                'flex min-h-[72px] select-none flex-col items-center justify-center gap-1 rounded-xl border-2 text-base font-medium transition',
                'touch-manipulation active:scale-[0.98] disabled:opacity-50',
                last && odd ? 'col-span-2' : '',
                isRunning
                  ? 'border-dashed border-zinc-300 bg-transparent text-zinc-400 dark:border-zinc-700 dark:text-zinc-500'
                  : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
              ].join(' ')}
              style={isRunning ? undefined : { borderColor: `${CATEGORY_COLOR[c]}55` }}
            >
              <span>{CATEGORY_LABEL[c]}</span>
              {isRunning ? <span className="text-xs">Running</span> : null}
            </button>
          );
        })}
      </div>

      {sheetFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Start with adjusted time"
          onClick={() => setSheetFor(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:bg-zinc-900"
            style={{ overscrollBehavior: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">
              Start {CATEGORY_LABEL[sheetFor]} with adjusted time
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              When did you actually start?
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {ADJUST_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="min-h-12 rounded-xl border border-zinc-200 text-sm font-medium active:scale-[0.99] dark:border-zinc-800"
                  onClick={() => {
                    const c = sheetFor;
                    setSheetFor(null);
                    onStart(c, m);
                  }}
                >
                  started {m} minutes ago
                </button>
              ))}
              <button
                type="button"
                className="min-h-12 rounded-xl text-sm text-zinc-500 dark:text-zinc-400"
                onClick={() => setSheetFor(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
