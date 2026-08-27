'use client';

import type { Toast } from '@/hooks/useActivities';

export default function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      // Cao hơn bottom nav một quãng để không đè lên nút mic ở màn Now.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action?.run();
                onDismiss(t.id);
              }}
              className="min-h-11 shrink-0 px-2 font-semibold text-blue-400 active:scale-[0.97] dark:text-blue-600"
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
