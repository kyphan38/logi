'use client';

import { useCallback, useEffect, useRef } from 'react';

import { catInk } from '@/lib/category-style';
import { MOVE_LIMIT_PX, isRealTap, type Press } from '@/lib/tap-guard';
import type { ChecklistRow } from '@/lib/tasks';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Checklist task hôm nay ở màn Now (Stage 8)
//
// Nằm dưới banner, trên lưới 4 nút. Chỉ hiện khi hôm nay có task. Mỗi dòng gọn
// MỘT hàng (~40px): trạng thái + chấm category + title + tiến độ. Một hàng hai
// dòng là thứ làm màn Now tràn khỏi iPhone 11 - nên tiến độ nằm cùng hàng,
// category đọc qua chấm màu và aria-label.
//
// Chạm có đủ ba lớp chống bấm nhầm như lưới nút: ngưỡng di chuyển, chặn sau
// cuộn, Undo 5 giây (Undo nằm ở toast của trang, không ở đây).
// ---------------------------------------------------------------------------

export default function TaskChecklist({
  rows,
  busy,
  onStart,
  onStop,
}: {
  rows: ChecklistRow[];
  busy: boolean;
  onStart: (row: ChecklistRow) => void;
  onStop: (row: ChecklistRow) => void;
}) {
  const down = useRef<{ x: number; y: number; at: number; row: ChecklistRow } | null>(null);
  const lastScrollAt = useRef<number | null>(null);

  // Vừa cuộn xong thì mọi chạm đều đáng ngờ - cùng luật với CategoryGrid.
  useEffect(() => {
    const onScroll = (e: Event) => {
      lastScrollAt.current = e.timeStamp;
      down.current = null;
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const pressStart = useCallback((row: ChecklistRow, e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, row };
  }, []);

  const pressMove = useCallback((e: React.PointerEvent) => {
    const d = down.current;
    if (!d) return;
    // Ngón đã đi xa thì đây là cuộn, không phải chạm.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_LIMIT_PX) down.current = null;
  }, []);

  const press = useCallback(
    (row: ChecklistRow, e: React.PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || d.row.taskId !== row.taskId) return;
      const p: Press = {
        downX: d.x,
        downY: d.y,
        downAt: d.at,
        upX: e.clientX,
        upY: e.clientY,
        upAt: e.timeStamp,
        lastScrollAt: lastScrollAt.current,
      };
      if (!isRealTap(p)) return;
      if (row.runningId) onStop(row);
      else if (!row.done) onStart(row);
    },
    [onStart, onStop]
  );

  if (rows.length === 0) return null;

  return (
    <section aria-label="Today's tasks" className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <button
          key={r.taskId}
          type="button"
          disabled={busy}
          onPointerDown={(e) => pressStart(r, e)}
          onPointerMove={pressMove}
          onPointerUp={(e) => press(r, e)}
          onPointerCancel={() => (down.current = null)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={
            r.runningId
              ? `Stop ${r.title}, ${CATEGORY_LABEL[r.category]}, ${r.label}`
              : r.done
                ? `${r.title} done, ${CATEGORY_LABEL[r.category]}, ${r.label}`
                : `Start ${r.title}, ${CATEGORY_LABEL[r.category]}, ${r.label}`
          }
          className={[
            'relative flex min-h-[40px] select-none items-center gap-2 overflow-hidden',
            'rounded-md border border-line bg-surface-1 px-3 text-left',
            'touch-manipulation transition active:scale-[0.99] disabled:opacity-50',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
              r.done
                ? 'border-transparent bg-emerald-500 text-white'
                : r.runningId
                  ? 'border-transparent text-white'
                  : 'border-zinc-300 text-transparent dark:border-zinc-700',
            ].join(' ')}
            style={r.runningId && !r.done ? { backgroundColor: CATEGORY_COLOR[r.category] } : undefined}
          >
            ✓
          </span>

          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: catInk(r.category) }}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
            {r.title}
          </span>

          <span className="shrink-0 text-xs tabular-nums text-ink-muted">{r.label}</span>

          {r.runningId ? (
            <span className="shrink-0 rounded-sm bg-ink px-2.5 py-1 text-xs font-medium text-[var(--surface-0)]">
              Stop
            </span>
          ) : r.done ? (
            <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Done
            </span>
          ) : null}

          {/* Dải tiến độ mảnh ở mép dưới - cùng ngôn ngữ với lưới nút. */}
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-surface-2">
            <span
              className="absolute inset-y-0 left-0"
              style={{
                width: `${r.fill * 100}%`,
                backgroundColor: r.done ? '#10b981' : CATEGORY_COLOR[r.category],
              }}
            />
          </span>
        </button>
      ))}
    </section>
  );
}
