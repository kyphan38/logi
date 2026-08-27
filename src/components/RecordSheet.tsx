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
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

export type SheetTarget =
  | { mode: 'edit'; activity: Activity }
  | { mode: 'create'; startAt: number; endAt: number };

/** Undo sau khi xoá: session đang chạy thì bật chạy lại, còn lại tạo record cũ. */
export async function restoreActivity(uid: string, a: Activity): Promise<void> {
  if (a.endAt === null) {
    await startActivity(uid, { category: a.category, label: a.label, startAt: a.startAt });
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
  'min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base dark:border-zinc-800 dark:bg-zinc-900';

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

  // Sheet mở thì khoá cuộn trang nền — cuộn lan ra sau lưng rất khó chịu.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Vuốt xuống để đóng. Chỉ kéo từ phần đầu sheet, tránh đụng các field.
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
  // Session đang chạy: để trống End nghĩa là vẫn chạy tiếp.
  const running = editing?.endAt === null && end === null;
  const endRequired = !editing || editing.endAt !== null;

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
  const duration = start !== null && end !== null ? formatDuration(end - start) : '—';

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
            // Đang chạy mà điền End → session kết thúc, không còn 'active'.
            ...(editing.endAt === null && end !== null ? { status: 'done' as const } : {}),
          }),
          late
        );
      } else {
        await capWait(
          createPastActivity(uid, {
            category,
            label: text,
            startAt: start,
            endAt: end as number,
          }),
          late
        );
      }

      // Đổi ngày logic → phải nói ra, không thì tưởng record biến mất.
      const before = editing ? editing.logicalDate : logicalDate(start);
      const after = logicalDate(start);
      onToast(
        before !== after
          ? `Moved to ${shortDate(start)}`
          : editing
            ? 'Saved.'
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
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 dark:bg-zinc-900"
        style={{
          overscrollBehavior: 'contain',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Vùng kéo: thanh nắm + tiêu đề. */}
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
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errors.start}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              End {editing?.endAt === null ? <span className="font-normal">(still running)</span> : null}
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
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errors.end}
              </span>
            ) : null}
          </label>

          <p className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
            Duration: {running ? 'running' : duration}
          </p>
        </div>

        {failure ? (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
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
                'min-h-11 flex-1 rounded-xl border text-sm font-medium transition active:scale-[0.99] disabled:opacity-50',
                confirming
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-zinc-200 text-red-600 dark:border-zinc-700 dark:text-red-400',
              ].join(' ')}
            >
              {confirming ? 'Really delete?' : 'Delete'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl border border-zinc-200 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            disabled={busy || !valid}
            onClick={save}
            className="min-h-11 flex-1 rounded-xl bg-zinc-900 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
