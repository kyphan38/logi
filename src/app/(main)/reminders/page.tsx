'use client';

// ============================================================
// logi - Màn hình Reminder (Stage 9)
//
// Những mốc người dùng TỰ gõ vào: hạn nộp, lịch khám, đám cưới. Khác hẳn nhắc
// thói quen ở `@/lib/reminders` - cái đó app tự suy ra từ activity.
//
// Sắp tới ở trên, gần nhất lên đầu. Việc đã qua gấp lại ở dưới cùng: giữ được
// để xoá, nhưng không chiếm chỗ của thứ còn dùng được.
// ============================================================

import { useCallback, useState } from 'react';

import EventRow from '@/components/EventRow';
import EventSheet from '@/components/EventSheet';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import { useToasts } from '@/hooks/useActivities';
import { useEvents } from '@/hooks/useEvents';
import { logicalDate } from '@/lib/balance';
import {
  archiveEvent,
  createEvent,
  EventError,
  hardDeleteEvent,
  restoreEvent,
  updateEvent,
  type EventInput,
} from '@/lib/event-store';
import { MAX_EVENTS, MILESTONES, type EventItem } from '@/types/logi';

/** null = đóng, 'new' = thêm mới, EventItem = đang sửa cái đó. */
type Sheet = null | 'new' | EventItem;

export default function RemindersPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { events, upcoming, past, now, loading, error } = useEvents();
  const { toasts, push, dismiss } = useToasts();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const today = logicalDate(now);
  const full = events.length >= MAX_EVENTS;

  const save = useCallback(
    async (input: EventInput) => {
      if (!uid) return;
      const editing = sheet !== 'new' && sheet !== null ? sheet : null;
      setBusy(true);
      try {
        if (editing) {
          await updateEvent(uid, editing, input);
          push('Event updated.');
        } else {
          const id = await createEvent(uid, input, events);
          // Undo là hard-delete: doc vừa sinh ra, chưa mốc nhắc nào chạm tới nó.
          push('Event added.', {
            label: 'Undo',
            run: () => void hardDeleteEvent(uid, id).catch(() => {}),
          });
        }
        setSheet(null);
      } catch (e) {
        push(e instanceof EventError ? e.message : 'Could not save. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [uid, sheet, events, push]
  );

  const remove = useCallback(async () => {
    if (!uid || sheet === null || sheet === 'new') return;
    const target = sheet;
    setBusy(true);
    try {
      await archiveEvent(uid, target.id);
      setSheet(null);
      push(`Removed “${target.title}”.`, {
        label: 'Undo',
        run: () => void restoreEvent(uid, target.id).catch(() => {}),
      });
    } catch {
      push('Could not remove. Try again.');
    } finally {
      setBusy(false);
    }
  }, [uid, sheet, push]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Reminder</h1>
        <span className="text-[13px] tabular-nums text-ink-muted">
          {upcoming.length} upcoming
        </span>
      </div>

      <button
        type="button"
        onClick={() => setSheet('new')}
        disabled={full}
        className="min-h-11 w-full rounded-lg bg-blue-600 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-40"
      >
        {full ? `${MAX_EVENTS} events max` : '+ Add event'}
      </button>

      {error && (
        <p className="rounded-md border border-red-300 px-3 py-2 text-[13px] text-red-600 dark:border-red-900 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
          <div className="h-16 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ) : upcoming.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((e) => (
            <li key={e.id}>
              <EventRow event={e} now={now} onEdit={() => setSheet(e)} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="min-h-11 text-[13px] text-ink-muted"
          >
            {showPast ? 'Hide' : 'Show'} past ({past.length})
          </button>
          {showPast && (
            <ul className="mt-2 flex flex-col gap-2">
              {past.map((e) => (
                <li key={e.id}>
                  <EventRow event={e} now={now} onEdit={() => setSheet(e)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sheet !== null && (
        <EventSheet
          event={sheet === 'new' ? null : sheet}
          today={today}
          now={now}
          busy={busy}
          onCancel={() => setSheet(null)}
          onSave={(input) => void save(input)}
          onArchive={() => void remove()}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-line-strong p-6 text-center">
      <p className="text-sm text-ink-soft">Nothing coming up.</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        Add a date you must not forget. You get a notification at{' '}
        {MILESTONES.filter((m) => m > 0).join(', ')} days before, and again on the day.
      </p>
    </div>
  );
}
