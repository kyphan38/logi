'use client';

import { useCallback, useMemo, useState } from 'react';

import ActiveSessionCard from '@/components/ActiveSessionCard';
import BalanceBanner from '@/components/BalanceBanner';
import CategoryGrid from '@/components/CategoryGrid';
import ClarifyCard from '@/components/ClarifyCard';
import StaleSessionModal from '@/components/StaleSessionModal';
import MicButton from '@/components/MicButton';
import ParseConfirmCard from '@/components/ParseConfirmCard';
import ReminderBanner from '@/components/ReminderBanner';
import RecordSheet, { type SheetTarget } from '@/components/RecordSheet';
import ScheduledCard from '@/components/ScheduledCard';
import Toasts from '@/components/Toasts';
import VoiceSheet from '@/components/VoiceSheet';
import WeeklyReview from '@/components/WeeklyReview';
import { useAuth } from '@/contexts/AuthContext';
import {
  capWait,
  useActiveActivities,
  useDayActivities,
  useScheduledActivities,
  useTick,
  useToasts,
  useWeekActivities,
} from '@/hooks/useActivities';
import { useReminders } from '@/hooks/useReminders';
import { useReviewDue } from '@/hooks/useReview';
import { useCurrentWeek, useRollover, useWeekTarget } from '@/hooks/useTargets';
import { useVoice } from '@/hooks/useVoice';
import { ActivityError, deleteActivity, startActivity, stopActivity } from '@/lib/activities';
import { findStale, logicalDate, overlapHours } from '@/lib/balance';
import { pickBalance } from '@/lib/banner';
import { roundDown } from '@/lib/datetime';
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

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

  // Weekly Review: banner từ 19:00 CN, còn hạn tới hết thứ Ba.
  const reviewWeek = useReviewDue();
  const [reviewOpen, setReviewOpen] = useState<string | null>(null);

  // Ngày logic đổi lúc 04:00, không phải nửa đêm → tick 60s là đủ.
  const nowMinute = useTick(60_000, true);
  const today = logicalDate(nowMinute);

  const { activities: active, loading: activeLoading, pendingIds } = useActiveActivities();
  const { activities: scheduled, pendingIds: scheduledPending } = useScheduledActivities();
  const { activities: todayActivities, totals } = useDayActivities(today);
  const { toasts, push, dismiss } = useToasts();

  // Chuyển tuần. Không có cron nên nó phải bám vào lúc người dùng mở app.
  // Idempotent, nên gọi thừa cũng không sao.
  useRollover();

  // Cân bằng tuần. Một dòng, hoặc không dòng nào.
  const week = useCurrentWeek();
  const { target: weekTarget } = useWeekTarget(week);
  const { activities: weekActivities } = useWeekActivities(week);
  const balanceLine = useMemo(
    () => pickBalance(weekActivities, weekTarget?.weekly ?? null, nowMinute),
    [weekActivities, weekTarget, nowMinute]
  );

  // Nhắc thắng balance banner: nó có hành động cụ thể hơn.
  const { reminder, dismiss: dismissReminder } = useReminders(
    todayActivities,
    weekActivities,
    weekTarget?.weekly ?? null
  );
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  // Record dưới một phút đang chờ người dùng xác nhận (4.6 Task 5).
  const [zeroStop, setZeroStop] = useState<{ id: string; at: number } | null>(null);

  const voice = useVoice(uid, active, push);

  // Card voice đang mở thì FAB phải nhường chỗ.
  const voiceCardOpen = voice.pending !== null || voice.clarify !== null;

  // Voice bí thì luôn phải có đường lui: mở sheet nhập tay, 1 tiếng vừa rồi.
  const openManual = useCallback(() => {
    const end = roundDown(Date.now(), 15);
    setSheet({ mode: 'create', startAt: end - 3_600_000, endAt: end });
  }, []);

  // Chồng lấn hiện theo giờ, một chữ số thập phân — mỗi bậc là 6 phút. Tick
  // mỗi giây ở đây sẽ render lại CẢ trang 60 lần/phút chỉ để đổi cùng một con
  // số. Đồng hồ đếm giây nằm trong từng card (`useElapsed`), không phải ở đây.
  const overlap = useMemo(
    () => (active.length > 1 ? overlapHours(active, nowMinute) : 0),
    [active, nowMinute]
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

  /** Huỷ session đã hẹn: xoá hẳn record, kèm Undo vì bấm nhầm thì mất luôn lịch. */
  async function handleCancelScheduled(a: Activity) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await capWait(deleteActivity(uid, a.id), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`${CATEGORY_LABEL[a.category]} cancelled.`, {
        label: 'Undo',
        run: () => {
          void startActivity(uid, {
            category: a.category,
            label: a.label,
            startAt: a.startAt,
            status: 'scheduled',
          }).catch((e) => push(`Could not undo. ${(e as Error).message}`));
        },
      });
    } catch (e) {
      push(`Could not cancel. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(id: string) {
    if (!uid || busy) return;
    // Chốt mốc dừng NGAY lúc bấm. Nếu đợi tới lúc người dùng bấm Save trong
    // hộp thoại thì record dài thêm đúng bằng thời gian họ do dự.
    const at = Date.now();
    const a = active.find((x) => x.id === id);
    // Start rồi stop trong cùng một phút gần như luôn là thao tác nhầm.
    // Hỏi lại, nhưng KHÔNG tự chặn - có thể họ thật sự muốn ghi.
    if (a && at - a.startAt < 60_000) {
      setZeroStop({ id, at });
      return;
    }
    await commitStop(id, at);
  }

  async function commitStop(id: string, at: number) {
    if (!uid) return;
    setZeroStop(null);
    setBusy(true);
    try {
      await capWait(stopActivity(uid, id, at), (e) =>
        push(`Sync failed. ${(e as Error).message}`),
      );
    } catch (e) {
      push(`Could not stop. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function discardStop(id: string) {
    if (!uid) return;
    setZeroStop(null);
    setBusy(true);
    try {
      await capWait(deleteActivity(uid, id), (e) =>
        push(`Sync failed. ${(e as Error).message}`),
      );
      push('Record discarded.');
    } catch (e) {
      push(`Could not discard. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function focusRunning(category: Category) {
    // Chạm lại category đang chạy: không tạo trùng. Cuộn tới card + nói rõ lý do,
    // nếu không thì cú chạm trông như bị nuốt khi card vốn đã nằm trong màn hình.
    document
      .getElementById(`session-${category}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    push(`${CATEGORY_LABEL[category]} is already running.`);
  }

  return (
    // pb-20: chừa chỗ cho nút mic FAB, để nó không đè lên nút Stop của card cuối.
    <div className="flex flex-1 flex-col gap-6 pb-20">
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

      {reviewWeek && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-surface-1 px-4 py-3">
          <p className="text-sm text-ink">Review your week</p>
          <button
            type="button"
            onClick={() => setReviewOpen(reviewWeek)}
            className="shrink-0 rounded-sm bg-ink px-3 py-1.5 text-[13px] font-medium text-[var(--surface-0)] transition active:scale-[0.98]"
          >
            Open
          </button>
        </div>
      )}

      {reviewOpen && <WeeklyReview week={reviewOpen} onClose={() => setReviewOpen(null)} />}

      {reminder ? (
        <ReminderBanner
          reminder={reminder}
          busy={busy}
          onStartLearn={() => handleStart('learn', 0)}
          onDismiss={dismissReminder}
        />
      ) : (
        <BalanceBanner line={balanceLine} />
      )}

      {scheduled.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Scheduled sessions">
          {scheduled.map((a) => (
            <ScheduledCard
              key={a.id}
              activity={a}
              busy={busy}
              pending={scheduledPending.has(a.id)}
              onCancel={() => handleCancelScheduled(a)}
            />
          ))}
        </section>
      ) : null}

      {/* Chưa biết có session nào đang chạy hay không thì giữ chỗ, đừng để
          CategoryGrid nhảy xuống ngay khi dữ liệu về. */}
      {activeLoading && active.length === 0 ? (
        <div
          className="h-[76px] animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900"
          aria-busy="true"
          aria-label="Loading sessions"
        />
      ) : null}

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

      {zeroStop ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
          <div className="w-full max-w-lg rounded-t-lg bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5">
            <h3 className="mb-1 text-base font-semibold text-ink">
              Less than a minute. Save anyway?
            </h3>
            <p className="mb-4 text-sm text-ink-soft">
              Start and stop landed in the same minute.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void discardStop(zeroStop.id)}
                disabled={busy}
                className="flex-1 rounded-sm border border-line py-2.5 text-sm font-medium text-ink-soft disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void commitStop(zeroStop.id, zeroStop.at)}
                disabled={busy}
                className="flex-1 rounded-sm bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
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

      {/* Đang nghĩ / đang ghi → làm mờ nhẹ, vẫn đọc được, vẫn bấm được. */}
      {voice.thinking || voice.saving ? (
        <div
          aria-hidden="true"
          className="dim-in pointer-events-none fixed inset-0 z-30 bg-zinc-950/10 dark:bg-black/30"
        />
      ) : null}

      {/* Có card voice thì giấu FAB — nếu không nó đè lên nút Confirm/Cancel. */}
      {voiceCardOpen ? null : (
        <MicButton
          disabled={busy || voice.saving}
          thinking={voice.thinking}
          onResult={(r) => void voice.handleRecording(r, openManual)}
        />
      )}

      {voice.clarify ? (
        <VoiceSheet>
          <ClarifyCard
            question={voice.clarify.question}
            options={voice.clarify.options}
            transcript={voice.clarify.transcript}
            busy={voice.thinking || voice.saving}
            onPick={(o) => void voice.answerClarify(o, openManual)}
            onManual={() => {
              voice.cancelClarify();
              openManual();
            }}
            onCancel={voice.cancelClarify}
          />
        </VoiceSheet>
      ) : null}

      {voice.pending ? (
        <VoiceSheet>
          <ParseConfirmCard
            key={voice.pending.requestId}
            cmd={voice.pending.cmd}
            missing={voice.pending.missing}
            active={active}
            busy={voice.saving}
            onConfirm={voice.confirmPending}
            onCancel={voice.cancelPending}
          />
        </VoiceSheet>
      ) : null}

      {sheet && uid ? (
        <RecordSheet
          target={sheet}
          uid={uid}
          now={nowMinute}
          onClose={() => setSheet(null)}
          onToast={(m) => push(m)}
          onDeleted={() => setSheet(null)}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
