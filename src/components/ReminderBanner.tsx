'use client';

// ============================================================
// logi - One reminder, with a do-it-now button.
//
// The button calls `startActivity()` directly, no sheet. A reminder that
// needs three more taps is a reminder nobody uses.
// ============================================================

import type { Reminder } from '@/lib/reminders';

export default function ReminderBanner({
  reminder,
  busy,
  onStartLearn,
  onDismiss,
}: {
  reminder: Reminder | null;
  busy: boolean;
  onStartLearn: () => void;
  onDismiss: () => void;
}) {
  if (!reminder) return null;

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-900 dark:text-zinc-100">{reminder.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="-m-1.5 shrink-0 p-1.5 text-zinc-400 active:scale-90"
        >
          ✕
        </button>
      </div>

      {reminder.action === 'start-learn' && (
        <button
          type="button"
          onClick={onStartLearn}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 active:scale-[0.99] disabled:opacity-40"
        >
          Start Learn
        </button>
      )}
    </div>
  );
}
