'use client';

import { useMemo, useState } from 'react';

import TaskGrid from '@/components/TaskGrid';
import TaskSheet from '@/components/TaskSheet';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import { useToasts } from '@/hooks/useActivities';
import { useWeekTarget } from '@/hooks/useTargets';
import { usePool, useWeekPlan } from '@/hooks/useTasks';
import { overTargetWarnings } from '@/lib/tasks';
import {
  archiveTask,
  copyWeekPlan,
  createTask,
  restoreTask,
  updateTask,
} from '@/lib/task-store';
import { addWeeks, weekLabel } from '@/lib/week';
import {
  MAX_POOL_TASKS,
  type Category,
  type PlannedCell,
  type PoolTask,
} from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Kế hoạch task tuần trong tab Targets (Stage 8)
//
// Hàng = task trong pool, cột = 7 ngày. Tuần đang xem có nút điều hướng riêng:
// nó không dính tới target tuần hiện tại - lập kế hoạch tuần sau trong khi tuần
// này vẫn đang chạy là chuyện bình thường.
// ---------------------------------------------------------------------------

export default function WeekPlanSection({ currentWeek }: { currentWeek: string }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [viewWeek, setViewWeek] = useState(currentWeek);
  const { tasks, loading: poolLoading } = usePool();
  const { cells, loading: planLoading, save, hasPlan } = useWeekPlan(viewWeek);
  const { target } = useWeekTarget(viewWeek);

  const { toasts, push, dismiss } = useToasts();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ task: PoolTask | null } | null>(null);
  const [confirmCopy, setConfirmCopy] = useState(false);

  const warnings = useMemo(
    () => overTargetWarnings(cells, target?.weekly ?? null),
    [cells, target]
  );

  const canNext = viewWeek < currentWeek;
  const poolFull = tasks.length >= MAX_POOL_TASKS;

  async function onGridChange(next: PlannedCell[]) {
    try {
      await save(next);
    } catch (e) {
      push(`Could not save plan. ${(e as Error).message}`);
    }
  }

  async function onSave(input: { title: string; durationMin: number; category: Category }) {
    if (!uid) return;
    setBusy(true);
    try {
      if (sheet?.task) {
        await updateTask(uid, sheet.task.id, input);
        push('Task updated. This week keeps its old copy - toggle the cell off and on to use the new length.');
      } else {
        await createTask(uid, input, tasks);
        push('Task added.');
      }
      setSheet(null);
    } catch (e) {
      push(`Could not save task. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onArchive() {
    if (!uid || !sheet?.task) return;
    const t = sheet.task;
    setBusy(true);
    try {
      await archiveTask(uid, t.id);
      setSheet(null);
      push(`Removed “${t.title}”.`, {
        label: 'Undo',
        run: () => {
          void restoreTask(uid, t.id).catch((e) =>
            push(`Could not undo. ${(e as Error).message}`)
          );
        },
      });
    } catch (e) {
      push(`Could not remove task. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doCopy() {
    if (!uid) return;
    setBusy(true);
    try {
      const n = await copyWeekPlan(uid, addWeeks(viewWeek, -1), viewWeek);
      push(n === 0 ? 'Last week was empty - nothing to copy.' : `Copied ${n} cell(s) from last week.`);
    } catch (e) {
      push(`Could not copy. ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setConfirmCopy(false);
    }
  }

  return (
    <section aria-label="Weekly tasks" className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Weekly tasks
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setConfirmCopy(false);
              setViewWeek((w) => addWeeks(w, -1));
            }}
            aria-label="Previous week"
            className="rounded px-2 py-1 text-sm text-zinc-500 transition active:scale-95 dark:text-zinc-400"
          >
            ‹
          </button>
          <span className="min-w-10 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {weekLabel(viewWeek)}
          </span>
          <button
            type="button"
            onClick={() => {
              setConfirmCopy(false);
              setViewWeek((w) => addWeeks(w, 1));
            }}
            disabled={!canNext}
            aria-label="Next week"
            className="rounded px-2 py-1 text-sm text-zinc-500 transition active:scale-95 disabled:opacity-30 dark:text-zinc-400"
          >
            ›
          </button>
        </div>
      </div>

      {poolLoading || planLoading ? (
        <p className="py-6 text-center text-sm text-zinc-400">Loading…</p>
      ) : (
        <>
          <TaskGrid
            tasks={tasks}
            cells={cells}
            warnings={warnings}
            disabled={busy}
            onChange={(next) => void onGridChange(next)}
            onNotice={(m) => push(m)}
            onEditTask={(t) => setSheet({ task: t })}
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || poolFull}
              onClick={() => setSheet({ task: null })}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              {poolFull ? `Pool full (${MAX_POOL_TASKS})` : 'Add task'}
            </button>
            {confirmCopy ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmCopy(false)}
                  className="min-h-11 flex-1 rounded-lg border border-zinc-300 text-sm dark:border-zinc-700"
                >
                  Keep
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doCopy()}
                  className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-40"
                >
                  Overwrite
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => (hasPlan ? setConfirmCopy(true) : void doCopy())}
                title={
                  hasPlan
                    ? 'This week already has a plan - you will be asked before overwriting'
                    : `Copy ${weekLabel(addWeeks(viewWeek, -1))} → ${weekLabel(viewWeek)}`
                }
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                Copy last week
              </button>
            )}
          </div>
          {confirmCopy && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {weekLabel(viewWeek)} already has a plan. Overwrite it with last week?
            </p>
          )}
        </>
      )}

      {sheet && (
        <TaskSheet
          task={sheet.task}
          busy={busy}
          onCancel={() => setSheet(null)}
          onSave={(input) => void onSave(input)}
          onArchive={() => void onArchive()}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
