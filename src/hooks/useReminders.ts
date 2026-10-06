'use client';

// ============================================================
// logi - In-app reminders. No push notification.
//
// Checked on mount, on return to the foreground, and every 60 seconds.
// ============================================================

import { useCallback, useMemo, useState } from 'react';

import { useOnForeground, useTick } from '@/hooks/useActivities';
import { pickReminder, type Reminder } from '@/lib/reminders';
import type { Activity, Category } from '@/types/logi';

const PREFIX = 'reminder:';
const EMPTY: ReadonlySet<string> = new Set();

/**
 * Dismissals live in `localStorage` - per device. Acceptable: it saves a
 * Firestore write for something that only lives for a day.
 *
 * Reads everything at once instead of key by key, so `dismissed` is real
 * React state - the hook does not force re-renders with a fake counter.
 */
function readAll(): ReadonlySet<string> {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const out = new Set<string>();
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) out.add(k);
    }
    return out;
  } catch {
    // Safari private mode throws here. Better to remind twice than crash.
    return EMPTY;
  }
}

export function useReminders(
  day: Activity[],
  week: Activity[],
  weekly: Record<Category, number> | null
): { reminder: Reminder | null; dismiss: () => void } {
  const now = useTick(60_000, true);

  // Lazy init: runs on the client at first render; the server gets empty.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(readAll);

  // Another device's dismissal is not seen, but another tab's is.
  useOnForeground(useCallback(() => setDismissed(readAll()), []));

  const reminder = useMemo(
    () => pickReminder({ now, day, week, weekly, isDismissed: (k) => dismissed.has(k) }),
    [now, day, week, weekly, dismissed]
  );

  const dismiss = useCallback(() => {
    if (!reminder) return;
    try {
      window.localStorage.setItem(reminder.key, '1');
    } catch {
      // If the write fails, the reminder shows again after a reload.
      // Not worth pushing an error toast onto the screen.
    }
    setDismissed((prev) => new Set(prev).add(reminder.key));
  }, [reminder]);

  return { reminder, dismiss };
}
