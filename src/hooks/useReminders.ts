'use client';

// ============================================================
// logi - Nhắc trong app. Không push notification.
//
// Kiểm tra lúc mount, lúc quay lại foreground, và mỗi 60 giây.
// ============================================================

import { useCallback, useMemo, useState } from 'react';

import { useOnForeground, useTick } from '@/hooks/useActivities';
import { pickReminder, type Reminder } from '@/lib/reminders';
import type { Activity, Category } from '@/types/logi';

const PREFIX = 'reminder:';
const EMPTY: ReadonlySet<string> = new Set();

/**
 * Dismiss lưu ở `localStorage` - mỗi thiết bị riêng. Chấp nhận được:
 * đổi lấy việc không tốn write Firestore cho một thứ chỉ sống trong ngày.
 *
 * Đọc hết một lượt thay vì tra từng key, để `dismissed` là state React
 * thật - hook không phải tự ép render lại bằng biến đếm giả.
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
    // Safari private mode ném ở đây. Thà nhắc thừa còn hơn crash.
    return EMPTY;
  }
}

export function useReminders(
  day: Activity[],
  week: Activity[],
  weekly: Record<Category, number> | null
): { reminder: Reminder | null; dismiss: () => void } {
  const now = useTick(60_000, true);

  // Khởi tạo lười: chạy trên client ở lần render đầu, server thì ra rỗng.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(readAll);

  // Thiết bị khác dismiss thì không thấy, nhưng tab khác thì có.
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
      // Không ghi được thì nhắc sẽ hiện lại sau khi tải lại trang.
      // Không đáng để chen một toast lỗi vào màn hình.
    }
    setDismissed((prev) => new Set(prev).add(reminder.key));
  }, [reminder]);

  return { reminder, dismiss };
}
