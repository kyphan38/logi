'use client';

// Start, stop, routine and bedtime actions of the Now screen.

import { useState } from 'react';

import { type SheetTarget } from '@/components/RecordSheet';
import { type StartWhen } from '@/components/StartWhenSheet';
import { capWait } from '@/hooks/useActivities';
import { useToasts } from '@/hooks/useToasts';
import { bedtimeDate, logBedtime, useRecentBedtime } from '@/hooks/useBedtime';
import { useRoutineChecks } from '@/hooks/useRoutine';
import {
  ActivityError,
  deleteActivity,
  startActivity,
  stopActivity,
  updateActivity,
} from '@/lib/activities';
import { clearBedtime } from '@/lib/bedtime-store';
import { formatBedtime } from '@/lib/bedtime';
import { clockTime, prettyDay } from '@/lib/datetime';
import { CATEGORY_LABEL, type Activity, type Category, type RoutineItem } from '@/types/logi';



export function useNowActions({
  uid,
  active,
  push,
  routine,
  setSheet,
  today,
  bedtimeLog,
  lastNight,
  setBedtimeOpen,
}: {
  uid: string | null;
  active: Activity[];
  push: ReturnType<typeof useToasts>['push'];
  routine: ReturnType<typeof useRoutineChecks>;
  setSheet: (s: SheetTarget | null) => void;
  today: string;
  bedtimeLog: ReturnType<typeof useRecentBedtime>['tonight'];
  lastNight: ReturnType<typeof useRecentBedtime>['lastNight'];
  setBedtimeOpen: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  // A sub-minute record waiting for the user to confirm (4.6 Task 5).
  const [zeroStop, setZeroStop] = useState<{ id: string; at: number } | null>(null);

  /**
   * `when.startAt === null` is the everyday path: one tap, start now.
   * `scheduled` means the record waits until its time; `promoteScheduled()` starts it.
   */
  async function handleStart(category: Category, when: StartWhen, item?: RoutineItem) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      // Offline: the cache already has the write, do not make the button wait for a server ack.
      const started = startActivity(uid, {
        category,
        startAt: when.startAt ?? undefined,
        status: when.scheduled ? 'scheduled' : 'active',
        ...(item
          ? {
              label: item.text,
              routineItemId: item.id,
              dueAt: item.minutes ? Date.now() + item.minutes * 60_000 : undefined,
            }
          : {}),
      });
      await capWait(started, (e) => push(`Sync failed. ${(e as Error).message}`));
      // Layer 3 of 6c: Start is one tap, so there must always be a 5-second way back.
      // `started` is kept separately because `capWait` may return before there is an id.
      const done =
        when.scheduled && when.startAt !== null
          ? `${CATEGORY_LABEL[category]} scheduled for ${clockTime(when.startAt)}`
          : `Started ${item ? item.text : CATEGORY_LABEL[category]}`;
      push(done, {
        label: 'Undo',
        run: () => {
          void started
            .then((id) => deleteActivity(uid, id))
            .catch((e) => push(`Could not undo. ${(e as Error).message}`));
        },
      });
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

  function handleStartRoutine(item: RoutineItem) {
    if (item.category) void handleStart(item.category, { startAt: null, scheduled: false }, item);
  }

  /** "Done?" → yes: stop the session and tick its item. */
  async function handleRoutineDone(a: Activity) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await capWait(stopActivity(uid, a.id, Date.now()), (e) =>
        push(`Sync failed. ${(e as Error).message}`),
      );
      const itemId = a.routineItemId;
      if (itemId && !routine.isChecked(itemId)) {
        void routine.toggle(itemId).catch((e) => push(`Could not tick. ${(e as Error).message}`));
      }
      push(`${a.label ?? CATEGORY_LABEL[a.category]} done.`);
    } catch (e) {
      push(`Could not stop. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** "Done?" → not yet: keep the same session running, ask again later. */
  async function handleRoutineMore(a: Activity, minutes: number) {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await capWait(updateActivity(uid, a.id, { dueAt: Date.now() + minutes * 60_000 }), (e) =>
        push(`Sync failed. ${(e as Error).message}`),
      );
    } catch (e) {
      push(`Could not save. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Long-press a running button = "I started at the wrong time" → open the edit sheet. */
  function editRunning(category: Category) {
    const a = active.find((x) => x.category === category);
    if (a) setSheet({ mode: 'edit', activity: a });
  }

  /** Cancel a scheduled session: hard-delete the record, with Undo since a mistap loses the plan. */
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
    // Fix the stop time AT the tap. Waiting until the user taps Save in the
    // dialog would stretch the record by exactly their hesitation.
    const at = Date.now();
    const a = active.find((x) => x.id === id);
    // Start then stop in the same minute is almost always a mistake.
    // Ask, but DO NOT block - they may really want to record it.
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

  /** A night's existing mark, so Undo restores it instead of clearing. */
  function bedtimeOf(date: string): number | null {
    if (date === bedtimeLog.date) return bedtimeLog.bedtimeAt;
    if (date === lastNight.date) return lastNight.bedtimeAt;
    return null;
  }

  /** Shared Undo for save and delete: rewrite the old mark if any, else delete. */
  function restoreBedtime(date: string, prev: number | null) {
    if (!uid) return;
    const back = prev === null ? clearBedtime(uid, date) : logBedtime(uid, prev);
    void back.catch((e) => push(`Could not undo. ${(e as Error).message}`));
  }

  /** Log the bedtime. `at` may be last night - the logical day comes from it. */
  async function handleBedtime(at: number) {
    if (!uid || busy) return;
    setBedtimeOpen(false);
    setBusy(true);
    const date = bedtimeDate(at);
    const prev = bedtimeOf(date);
    try {
      await capWait(logBedtime(uid, at), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(
        date === today
          ? `Bedtime ${formatBedtime(at)} logged.`
          : `Bedtime ${formatBedtime(at)} logged for ${prettyDay(date)}.`,
        { label: 'Undo', run: () => restoreBedtime(date, prev) }
      );
    } catch (e) {
      push(`Could not log bedtime. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Delete a mistaken mark. Only in the sheet - nobody deletes it by accident from the header. */
  async function handleClearBedtime(date: string) {
    if (!uid || busy) return;
    setBedtimeOpen(false);
    setBusy(true);
    const prev = bedtimeOf(date);
    try {
      await capWait(clearBedtime(uid, date), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`Bedtime cleared for ${prettyDay(date)}.`, {
        label: 'Undo',
        run: () => restoreBedtime(date, prev),
      });
    } catch (e) {
      push(`Could not clear bedtime. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function focusRunning(category: Category) {
    // Tapping a running category again: no duplicate. Scroll to its card and say
    // why, otherwise the tap looks swallowed when the card is already on screen.
    document
      .getElementById(`session-${category}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    push(`${CATEGORY_LABEL[category]} is already running.`);
  }

  return {
    busy,
    zeroStop,
    handleStart,
    handleStartRoutine,
    handleRoutineDone,
    handleRoutineMore,
    editRunning,
    handleCancelScheduled,
    handleStop,
    commitStop,
    discardStop,
    handleBedtime,
    handleClearBedtime,
    focusRunning,
  };
}
