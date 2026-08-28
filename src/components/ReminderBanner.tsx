'use client';

// ============================================================
// logi - Một nhắc, có nút làm ngay.
//
// Nút gọi thẳng `startActivity()`, không mở sheet. Nhắc mà còn phải
// bấm thêm ba bước nữa thì không ai dùng.
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
    <div className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-indigo-900 dark:text-indigo-200">{reminder.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="-m-1.5 shrink-0 p-1.5 text-indigo-400 active:scale-90"
        >
          ✕
        </button>
      </div>

      {reminder.action === 'start-learn' && (
        <button
          type="button"
          onClick={onStartLearn}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-40"
        >
          Start Learn
        </button>
      )}
    </div>
  );
}
