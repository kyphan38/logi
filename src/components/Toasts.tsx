'use client';

import { useEffect, useState } from 'react';

import type { Toast } from '@/hooks/useActivities';
import { useFlip } from '@/hooks/useFlip';
import { leavingItems, reducedMotion } from '@/lib/motion';

/** Matches `.fade-out` in globals.css. */
const EXIT_MS = 200;

export default function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  // Toasts that just expired stay a moment to fade out. Derived during render
  // (not in an effect) so the leaving toast never blinks out for one frame.
  const [prev, setPrev] = useState(toasts);
  const [leaving, setLeaving] = useState<Toast[]>([]);
  // A tapped action already gave feedback, so its toast goes at once.
  const [acted, setActed] = useState<Set<number>>(() => new Set());

  if (prev !== toasts) {
    const gone = leavingItems(prev, toasts).filter((t) => !acted.has(t.id));
    setPrev(toasts);
    if (gone.length > 0 && !reducedMotion()) setLeaving((l) => [...l, ...gone]);
  }

  useEffect(() => {
    if (leaving.length === 0) return;
    const ids = new Set(leaving.map((t) => t.id));
    const timer = setTimeout(() => setLeaving((l) => l.filter((t) => !ids.has(t.id))), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const leavingIds = new Set(leaving.map((t) => t.id));
  const shown = [...toasts, ...leaving].sort((a, b) => a.id - b.id);
  const flip = useFlip(shown.map((t) => String(t.id)));

  if (shown.length === 0) return null;

  return (
    <div
      // Sits a bit above the bottom nav so it does not cover the mic button on Now.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {shown.map((t) => {
        const out = leavingIds.has(t.id);
        return (
          <div
            key={t.id}
            ref={flip(String(t.id))}
            aria-hidden={out || undefined}
            className={[
              'flex w-full max-w-sm items-center justify-between gap-3 rounded-md bg-zinc-900 px-4 py-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900',
              // A fading toast must not take a tap meant for its old Undo.
              out ? 'fade-out pointer-events-none' : 'rise pointer-events-auto',
            ].join(' ')}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                disabled={out}
                onClick={() => {
                  t.action?.run();
                  setActed((s) => new Set(s).add(t.id));
                  onDismiss(t.id);
                }}
                className="min-h-11 shrink-0 px-2 font-semibold text-white active:scale-[0.97] dark:text-zinc-900"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
