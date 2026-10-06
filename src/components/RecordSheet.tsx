'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { capWait } from '@/hooks/useActivities';

import {
  ActivityError,
  createPastActivity,
  deleteActivity,
  startActivity,
  updateActivity,
  validateTimes,
} from '@/lib/activities';
import { logicalDate } from '@/lib/balance';
import { formatDuration, fromLocalInput, shortDate, toLocalInput } from '@/lib/datetime';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  type Activity,
  type Category,
} from '@/types/logi';

export type SheetTarget =
  | { mode: 'edit'; activity: Activity }
  | { mode: 'create'; startAt: number; endAt: number };

/** Undo after delete: a running session restarts, anything else recreates the old record. */
export async function restoreActivity(uid: string, a: Activity): Promise<void> {
  if (a.endAt === null) {
    await startActivity(uid, {
      category: a.category,
      label: a.label,
      startAt: a.startAt,
    });
    return;
  }
  await createPastActivity(uid, {
    category: a.category,
    label: a.label,
    startAt: a.startAt,
    endAt: a.endAt,
    status: a.status,
  });
}

const FIELD =
  'min-h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-base dark:border-zinc-800 dark:bg-zinc-900';

export default function RecordSheet({
  target,
  uid,
  now,
  onClose,
  onToast,
  onDeleted,
}: {
  target: SheetTarget;
  uid: string;
  now: number;
  onClose: () => void;
  onToast: (message: string) => void;
  onDeleted: (a: Activity) => void;
}) {
  const editing = target.mode === 'edit' ? target.activity : null;

  const [category, setCategory] = useState<Category>(editing?.category ?? 'work');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [startStr, setStartStr] = useState(
    toLocalInput(editing ? editing.startAt : target.mode === 'create' ? target.startAt : now),
  );
  const [endStr, setEndStr] = useState(() => {
    if (editing) return editing.endAt === null ? '' : toLocalInput(editing.endAt);
    return toLocalInput(target.mode === 'create' ? target.endAt : now);
  });

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // While the sheet is open, lock the page behind - scroll leaking behind is annoying.
  // Lock exactly <main> (the only scrollable place), NEVER body: overflow on
  // body makes iOS Safari break every `position: fixed` child, this sheet included.
  // Overflow on a normal element keeps the scroll position.
  useEffect(() => {
    const scroller = document.getElementById('app-scroll');
    if (!scroller) return;
    const prev = scroller.style.overflowY;
    scroller.style.overflowY = 'hidden';
    return () => {
      scroller.style.overflowY = prev;
    };
  }, []);

  // Swipe down to close. Only from the top of the sheet, to avoid the fields.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);

  function startDrag(e: React.PointerEvent) {
    if (busy) return;
    dragFrom.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent) {
    if (dragFrom.current === null) return;
    setDragY(Math.max(0, e.clientY - dragFrom.current));
  }

  function endDrag() {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    setDragging(false);
    if (dragY > 80) onClose();
    else setDragY(0);
  }

  const start = fromLocalInput(startStr);
  const end = fromLocalInput(endStr);
  // Empty End = still running. Right in both cases:
  //  - editing a running session: keep it, never force an end time;
  //  - adding by hand: "I started at 8:00 and I am still at it" → a running session.
  // A finished record still requires End - clearing End to reopen is something
  // else, and could easily turn an old record into a session running for days.
  const endRequired = editing !== null && editing.endAt !== null;
  const running = !endRequired && end === null;

  const errors = useMemo(() => {
    const e: { start?: string; end?: string } = {};
    if (start === null) e.start = 'Pick a start time.';
    if (end === null && endRequired) e.end = 'Pick an end time.';

    if (start !== null && (end !== null || !endRequired)) {
      try {
        validateTimes(start, end, end === null ? 'active' : 'done', now);
      } catch (err) {
        const message = (err as Error).message;
        const code = err instanceof ActivityError ? err.code : 'other';
        if (code === 'too-old' || code === 'future') e.start = message;
        else e.end = message;
      }
    }
    return e;
  }, [start, end, endRequired, now]);

  const valid = !errors.start && !errors.end;
  const duration = start !== null && end !== null ? formatDuration(end - start) : '-';


  async function save() {
    if (!valid || busy || start === null) return;
    setBusy(true);
    setFailure(null);
    try {
      const text = label.trim() || null;
      const late = (e: unknown) => onToast(`Sync failed. ${(e as Error).message}`);
      if (editing) {
        await capWait(
          updateActivity(uid, editing.id, {
            category,
            label: text,
            startAt: start,
            endAt: end,
            // End filled on a running session → it ends, no longer 'active'.
            ...(editing.endAt === null && end !== null ? { status: 'done' as const } : {}),
          }),
          late
        );
      } else if (end === null) {
        // Adding an unfinished task by hand: open a running session from the given time.
        await capWait(
          startActivity(uid, { category, label: text, startAt: start }),
          late
        );
      } else {
        await capWait(
          createPastActivity(uid, {
            category,
            label: text,
            startAt: start,
            endAt: end,
          }),
          late
        );
      }

      // The logical day changed → say so, or it looks like the record vanished.
      const before = editing ? editing.logicalDate : logicalDate(start);
      const after = logicalDate(start);
      onToast(
        before !== after
          ? `Moved to ${shortDate(start)}`
          : editing
            ? 'Saved.'
            : end === null
              ? `Started ${CATEGORY_LABEL[category]}.`
              : `Added ${CATEGORY_LABEL[category]}.`,
      );
      onClose();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await capWait(deleteActivity(uid, editing.id), (e) =>
        onToast(`Sync failed. ${(e as Error).message}`)
      );
      onDeleted(editing);
      onClose();
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-lg bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 dark:bg-zinc-900"
        style={{
          overscrollBehavior: 'contain',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag area: handle + title. */}
        <div
          className="-mx-5 cursor-grab px-5 pb-1 pt-1"
          style={{ touchAction: 'none' }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700"
          />
          <h2 id="sheet-title" className="mt-3 text-lg font-semibold tracking-tight">
            {editing ? 'Edit record' : 'Add record'}
          </h2>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</span>
            <select
              value={category}
              disabled={busy}
              onChange={(e) => setCategory(e.target.value as Category)}
              className={FIELD}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Label <span className="font-normal">(optional)</span>
            </span>
            <input
              type="text"
              value={label}
              disabled={busy}
              placeholder="devops"
              onChange={(e) => setLabel(e.target.value)}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Start</span>
            <input
              type="datetime-local"
              value={startStr}
              disabled={busy}
              onChange={(e) => setStartStr(e.target.value)}
              aria-invalid={!!errors.start}
              className={FIELD}
            />
            {errors.start ? (
              <span role="alert" className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                {errors.start}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              End{' '}
              {endRequired ? null : (
                <span className="font-normal">(leave empty if still running)</span>
              )}
            </span>
            <input
              type="datetime-local"
              value={endStr}
              disabled={busy}
              onChange={(e) => setEndStr(e.target.value)}
              aria-invalid={!!errors.end}
              className={FIELD}
            />
            {errors.end ? (
              <span role="alert" className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                {errors.end}
              </span>
            ) : null}
          </label>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              Duration: {running ? 'running' : duration}
            </p>
            {/* Clearing a datetime field on a phone is fiddly - give a shortcut button. */}
            {endRequired ? null : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEndStr(running ? toLocalInput(now) : '')}
                className="text-sm font-medium text-zinc-500 underline underline-offset-2 disabled:opacity-50 dark:text-zinc-400"
              >
                {running ? 'End now' : 'Still running'}
              </button>
            )}
          </div>
        </div>

        {failure ? (
          <p role="alert" className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {failure}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          {editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => (confirming ? remove() : setConfirming(true))}
              className={[
                'min-h-11 flex-1 rounded-md border text-sm font-medium transition active:scale-[0.99] disabled:opacity-50',
                confirming
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100',
              ].join(' ')}
            >
              {confirming ? 'Really delete?' : 'Delete'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-11 flex-1 rounded-md border border-zinc-200 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            disabled={busy || !valid}
            onClick={save}
            className="min-h-11 flex-1 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
