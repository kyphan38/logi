'use client';

import { useState } from 'react';

import { shortDuration } from '@/lib/tasks';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  TASK_MAX_DURATION,
  TASK_MIN_DURATION,
  TASK_TITLE_MAX,
  type Category,
  type PoolTask,
} from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Thêm / sửa / xoá một task trong pool (Stage 8)
//
// Xoá ở đây là archive, không phải hard-delete: những tuần cũ vẫn phải đọc được
// tên task. Bản chụp trong ô đã giữ title/thời lượng rồi, nên archive chỉ gỡ
// task khỏi lưới của tuần đang xem trở đi.
// ---------------------------------------------------------------------------

const CHOICES = [15, 30, 45, 60, 90, 120] as const;

export default function TaskSheet({
  task,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  /** null → thêm mới. */
  task: PoolTask | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { title: string; durationMin: number; category: Category }) => void;
  onArchive: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [durationMin, setDuration] = useState(task?.durationMin ?? 30);
  const [category, setCategory] = useState<Category>(task?.category ?? 'learn');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const clean = title.trim();
  const ok = clean.length > 0 && durationMin >= TASK_MIN_DURATION && durationMin <= TASK_MAX_DURATION;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="w-full max-w-lg rounded-t-lg bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-zinc-950 md:rounded-lg md:pb-5">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {task ? 'Edit task' : 'New task'}
        </h3>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TASK_TITLE_MAX))}
          placeholder="Shadowing"
          autoFocus
          className="mb-4 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:text-zinc-100"
        />

        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Length</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDuration(m)}
              className={`min-h-11 rounded-md border px-3 text-sm tabular-nums transition ${
                durationMin === m
                  ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {shortDuration(m)}
            </button>
          ))}
        </div>

        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Category</p>
        <div className="mb-5 grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`min-h-11 rounded-md border px-2 text-[13px] transition ${
                category === c
                  ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        {confirmArchive ? (
          <div className="mb-3 rounded-md border border-red-300 p-3 dark:border-red-900">
            <p className="mb-3 text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">
              Remove “{task?.title}” from the grid? Past weeks keep their own copy.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 text-sm dark:border-zinc-700"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={onArchive}
                disabled={busy}
                className="min-h-11 flex-1 rounded-lg bg-red-600 text-sm font-medium text-white disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          task && (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="mb-3 min-h-11 text-sm text-red-600 dark:text-red-400"
            >
              Remove task
            </button>
          )
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ title: clean, durationMin, category })}
            disabled={busy || !ok}
            className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
