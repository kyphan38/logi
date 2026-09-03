'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { catInk, catTint } from '@/lib/category-style';
import {
  DOW_LABEL,
  GRID_DOWS,
  cellAt,
  clearDow,
  countOfDow,
  dayIsFull,
  paintRow,
  shortDuration,
  toggleCell,
  warnedDows,
  type OverTarget,
} from '@/lib/tasks';
import { MAX_TASKS_PER_DAY, type PlannedCell, type PoolTask } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Lưới kế hoạch tuần (Stage 8)
//
// Hàng = task, cột = 7 ngày. Bố cục này tồn tại vì cả tuần phải nằm gọn MỘT màn
// hình 375px; thẻ xếp trong cột ngày thì không bao giờ vừa.
//
// Kéo-để-tô chỉ bật từ md trở lên. Trên điện thoại, cử chỉ kéo ngang là cuộn -
// giành nó chính là lỗi đã gặp với lưới nút ở Now. Không có kéo-để-DI-CHUYỂN ở
// bất kỳ đâu: ô chỉ mang bật/tắt, kéo không nói thêm được gì.
// ---------------------------------------------------------------------------

export default function TaskGrid({
  tasks,
  cells,
  warnings,
  disabled,
  onChange,
  onNotice,
  onEditTask,
}: {
  tasks: PoolTask[];
  cells: PlannedCell[];
  warnings: OverTarget[];
  disabled: boolean;
  onChange: (next: PlannedCell[]) => void;
  onNotice: (message: string) => void;
  /** Chạm nhãn hàng trên mobile → sửa task. Trên desktop nhãn dùng để tô cả hàng. */
  onEditTask: (task: PoolTask) => void;
}) {
  const desktop = useDesktop();
  const warned = warnedDows(warnings);

  // Một lượt kéo: nhớ bật hay tắt để cả vệt cùng chiều, và nhớ ô đã đi qua để
  // không toggle đi toggle lại khi con trỏ rung trong một ô.
  const paint = useRef<{ taskId: string; on: boolean; seen: Set<number> } | null>(null);
  const blockedInDrag = useRef(0);

  const endPaint = useCallback(() => {
    if (!paint.current) return;
    paint.current = null;
    if (blockedInDrag.current > 0) {
      onNotice(`Max ${MAX_TASKS_PER_DAY} per day - ${blockedInDrag.current} day(s) skipped`);
      blockedInDrag.current = 0;
    }
  }, [onNotice]);

  useEffect(() => {
    if (!desktop) return;
    window.addEventListener('pointerup', endPaint);
    window.addEventListener('pointercancel', endPaint);
    return () => {
      window.removeEventListener('pointerup', endPaint);
      window.removeEventListener('pointercancel', endPaint);
    };
  }, [desktop, endPaint]);

  const toggle = useCallback(
    (task: PoolTask, dow: number) => {
      if (disabled) return;
      const r = toggleCell(cells, task, dow);
      if (!r.ok) {
        onNotice(r.reason);
        return;
      }
      onChange(r.cells);
    },
    [cells, disabled, onChange, onNotice]
  );

  /** Con trỏ đi vào một ô trong lúc đang kéo. Desktop-only. */
  const dragOver = useCallback(
    (task: PoolTask, dow: number) => {
      const p = paint.current;
      if (!p || disabled || p.taskId !== task.id || p.seen.has(dow)) return;
      p.seen.add(dow);
      const has = cellAt(cells, task.id, dow) !== null;
      if (has === p.on) return;
      const r = paintRow(cells, task, [dow], p.on);
      blockedInDrag.current += r.blocked;
      if (r.cells !== cells) onChange(r.cells);
    },
    [cells, disabled, onChange]
  );

  const toggleWholeRow = useCallback(
    (task: PoolTask) => {
      if (disabled) return;
      // Còn ô nào tắt thì bật hết; đã đủ 7 thì tắt hết.
      const on = GRID_DOWS.some((d) => cellAt(cells, task.id, d) === null);
      const r = paintRow(cells, task, GRID_DOWS, on);
      if (r.blocked > 0) onNotice(`Max ${MAX_TASKS_PER_DAY} per day - ${r.blocked} day(s) skipped`);
      onChange(r.cells);
    },
    [cells, disabled, onChange, onNotice]
  );

  if (tasks.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No tasks yet. Add one to start planning your week.
      </p>
    );
  }

  return (
    <div
      className="select-none"
      // Vệt kéo kết thúc ngoài lưới cũng phải đóng lượt.
      onPointerLeave={desktop ? endPaint : undefined}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,1.75rem)] gap-x-0.5 gap-y-1 md:grid-cols-[minmax(0,1fr)_repeat(7,2.25rem)]">
        {/* Hàng tiêu đề: tên thứ. Desktop chạm để xoá sạch ngày. */}
        <div />
        {GRID_DOWS.map((dow) => (
          <button
            key={dow}
            type="button"
            disabled={disabled || !desktop}
            onClick={() => onChange(clearDow(cells, dow))}
            title={desktop ? `Clear ${DOW_LABEL[dow]}` : undefined}
            className={`pb-1 text-center text-[10px] font-semibold uppercase tracking-wide ${
              warned.has(dow) ? 'text-amber-600 dark:text-amber-500' : 'text-zinc-400'
            } ${desktop && !disabled ? 'hover:text-zinc-900 dark:hover:text-zinc-100' : ''}`}
          >
            {DOW_LABEL[dow].slice(0, 1)}
            <span className="hidden md:inline">{DOW_LABEL[dow].slice(1)}</span>
          </button>
        ))}

        {tasks.map((task) => (
          <Row
            key={task.id}
            task={task}
            cells={cells}
            desktop={desktop}
            disabled={disabled}
            onLabel={() => (desktop ? toggleWholeRow(task) : onEditTask(task))}
            onEdit={() => onEditTask(task)}
            onToggle={(dow) => toggle(task, dow)}
            onPaintStart={(dow) => {
              if (!desktop || disabled) return;
              blockedInDrag.current = 0;
              paint.current = {
                taskId: task.id,
                on: cellAt(cells, task.id, dow) === null,
                seen: new Set([dow]),
              };
            }}
            onPaintOver={(dow) => dragOver(task, dow)}
          />
        ))}

        {/* Dòng đếm: mỗi ngày đã đặt bao nhiêu task. */}
        <div className="pt-1 text-right text-[10px] uppercase tracking-wide text-zinc-400">
          Per day
        </div>
        {GRID_DOWS.map((dow) => {
          const n = countOfDow(cells, dow);
          return (
            <div
              key={dow}
              className={`pt-1 text-center text-[11px] tabular-nums ${
                n === 0
                  ? 'text-zinc-300 dark:text-zinc-600'
                  : dayIsFull(cells, dow)
                    ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500'
              }`}
            >
              {n}
            </div>
          );
        })}
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {warnings.map((w) => (
            <li
              key={`${w.dow}-${w.category}`}
              className="text-[11px] leading-snug text-amber-700 dark:text-amber-500"
            >
              {w.text}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-snug text-zinc-400">
        {desktop
          ? 'Drag across a row to paint. Tap a task name for the whole week, a day name to clear it.'
          : 'Tap a cell to plan it. Tap a task name to edit.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Row({
  task,
  cells,
  desktop,
  disabled,
  onLabel,
  onEdit,
  onToggle,
  onPaintStart,
  onPaintOver,
}: {
  task: PoolTask;
  cells: PlannedCell[];
  desktop: boolean;
  disabled: boolean;
  onLabel: () => void;
  onEdit: () => void;
  onToggle: (dow: number) => void;
  onPaintStart: (dow: number) => void;
  onPaintOver: (dow: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onLabel}
        onDoubleClick={desktop ? onEdit : undefined}
        className="min-w-0 py-1 pr-2 text-left disabled:opacity-50"
      >
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: catInk(task.category) }}
          />
          <span className="truncate text-[13px] leading-tight text-zinc-900 dark:text-zinc-100">
            {task.title}
          </span>
        </span>
        <span className="ml-3.5 block text-[10px] leading-tight text-zinc-400">
          {shortDuration(task.durationMin)}
        </span>
      </button>

      {GRID_DOWS.map((dow) => {
        const on = cellAt(cells, task.id, dow) !== null;
        return (
          <button
            key={dow}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={`${task.title} on ${DOW_LABEL[dow]}`}
            onPointerDown={desktop ? () => onPaintStart(dow) : undefined}
            onPointerEnter={desktop ? () => onPaintOver(dow) : undefined}
            onClick={() => onToggle(dow)}
            className={`h-9 rounded-[3px] border transition active:scale-[0.94] disabled:opacity-50 md:h-10 ${
              on
                ? 'border-transparent'
                : 'border-zinc-200 bg-transparent dark:border-zinc-800'
            }`}
            style={on ? { background: catTint(task.category) } : undefined}
          />
        );
      })}
    </>
  );
}

/**
 * Từ `md` trở lên mới có chuột. Nghe `change` để cắm bàn phím / xoay máy vẫn đúng,
 * và SSR luôn thấy `false` để không bao giờ dựng bản desktop trên server.
 */
function useDesktop(): boolean {
  const mq = '(min-width: 768px) and (pointer: fine)';
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(mq);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(mq).matches,
    () => false
  );
}
