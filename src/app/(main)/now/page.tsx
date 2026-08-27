'use client';

import { useMemo, useState } from 'react';

import ActiveSessionCard from '@/components/ActiveSessionCard';
import CategoryGrid from '@/components/CategoryGrid';
import StaleSessionModal from '@/components/StaleSessionModal';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import {
  capWait,
  useActiveActivities,
  useDayActivities,
  useTick,
  useToasts,
} from '@/hooks/useActivities';
import { ActivityError, startActivity, stopActivity } from '@/lib/activities';
import { findStale, logicalDate, overlapHours } from '@/lib/balance';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/types/logi';

/** "2026-08-26" → "Wednesday, Aug 26". Parse tay để không lệch múi giờ. */
function prettyLogicalDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function NowPage() {
  const { user, signOut } = useAuth();
  const uid = user?.uid ?? null;

  // Ngày logic đổi lúc 04:00, không phải nửa đêm → tick 60s là đủ.
  const nowMinute = useTick(60_000, true);
  const today = logicalDate(nowMinute);

  const { activities: active, loading: activeLoading, pendingIds } = useActiveActivities();
  const { totals } = useDayActivities(today);
  const { toasts, push, dismiss } = useToasts();
  const [busy, setBusy] = useState(false);

  const nowSecond = useTick(1000, active.length > 1);
  const overlap = useMemo(
    () => (active.length > 1 ? overlapHours(active, nowSecond) : 0),
    [active, nowSecond]
  );

  const running = useMemo(() => new Set(active.map((a) => a.category)), [active]);

  // Session `active` quá 15h. `active` là stream realtime nên danh sách này tự
  // cập nhật khi mount, khi app quay lại foreground (useTick bắt 'focus'),
  // và ngay khi người dùng xử lý xong từng cái.
  const stale = useMemo(() => findStale(active, nowMinute), [active, nowMinute]);

  const todayLine = useMemo(
    () =>
      CATEGORIES.filter((c) => (totals[c] ?? 0) > 0)
        .map((c) => `${CATEGORY_LABEL[c]} ${(totals[c] ?? 0).toFixed(1)}h`)
        .join(' · '),
    [totals]
  );

  async function handleStart(category: Category, minutesAgo: number) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      // Offline: cache đã ghi ngay, đừng bắt nút chờ server ack.
      await capWait(
        startActivity(uid, {
          category,
          startAt: minutesAgo > 0 ? Date.now() - minutesAgo * 60_000 : undefined,
        }),
        (e) => push(`Sync failed. ${(e as Error).message}`)
      );
    } catch (e) {
      push(
        e instanceof ActivityError && e.code === 'duplicate'
          ? `${CATEGORY_LABEL[category]} is already running.`
          : `Could not start. ${(e as Error).message}`
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(id: string) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await capWait(stopActivity(uid, id), (e) => push(`Sync failed. ${(e as Error).message}`));
    } catch (e) {
      push(`Could not stop. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function focusRunning(category: Category) {
    document
      .getElementById(`session-${category}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Now</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{prettyLogicalDate(today)}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium active:scale-[0.99] dark:border-zinc-700"
        >
          Sign out
        </button>
      </header>

      {active.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Running sessions">
          {active.map((a) => (
            <ActiveSessionCard
              key={a.id}
              activity={a}
              busy={busy}
              pending={pendingIds.has(a.id)}
              onStop={() => handleStop(a.id)}
            />
          ))}
          {active.length > 1 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {active.length} running in parallel · {overlap.toFixed(1)}h overlap
            </p>
          ) : null}
        </section>
      ) : null}

      <CategoryGrid
        running={running}
        busy={busy}
        onStart={handleStart}
        onFocusRunning={focusRunning}
      />

      {todayLine ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Today: {todayLine}</p>
      ) : !activeLoading && active.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          Nothing tracked yet. Tap a category to start.
        </p>
      ) : null}

      {stale.length > 0 ? (
        <StaleSessionModal
          key={stale[0].id}
          activity={stale[0]}
          now={nowMinute}
          remaining={stale.length - 1}
          onResolved={() => push('Session updated.')}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
