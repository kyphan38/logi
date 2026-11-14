'use client';

// ============================================================
// logi - One reminder, with a do-it-now button.
//
// The button calls `startActivity()` directly, no sheet. A reminder that
// needs three more taps is a reminder nobody uses.
// ============================================================

import type { Reminder } from '@/lib/reminders';
import { btn } from '@/lib/ui';

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
    <div className="border-l-2 border-line-strong py-1 pl-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink">{reminder.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="-m-1.5 shrink-0 p-1.5 text-ink-muted active:scale-90"
        >
          ✕
        </button>
      </div>

      {reminder.action === 'start-learn' && (
        <button
          type="button"
          onClick={onStartLearn}
          disabled={busy}
          className={`${btn('primary')} mt-2 w-full`}
        >
          Start Learn
        </button>
      )}
    </div>
  );
}
