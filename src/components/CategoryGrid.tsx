'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { catInk, catTint } from '@/lib/category-style';
import type { NowTile } from '@/lib/day-progress';
import { MOVE_LIMIT_PX, isRealTap, type Press } from '@/lib/tap-guard';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

// -----------------------------------------------------------------------------
// logi - Lưới 4 nút Start (AMENDMENT-remove-sleep 6b + 6c)
//
// Chính cái nút là thanh đo: mỗi nút mang một dải 3px ở mép dưới, so giờ hôm nay
// với target của ĐÚNG ngày đó. Không thêm dòng nào mà vẫn thấy cái nào còn thiếu.
//
// Start giữ đúng MỘT chạm - không xác nhận, không long-press. Chống bấm nhầm nằm
// ở `isRealTap()`, không phải ở một bước hỏi lại.
// -----------------------------------------------------------------------------

/** Giữ lâu hơn ngưỡng của `isRealTap` → mở sheet lùi giờ, không phải Start. */
const LONG_PRESS_MS = 500;
const ADJUST_CHOICES = [5, 15, 30] as const;

/** Đoạn hổ phách ở mép phải khi vượt target. */
const OVER_PCT = 14;
const OVER_COLOR = '#f59e0b';

export default function CategoryGrid({
  tiles,
  running,
  busy,
  onStart,
  onFocusRunning,
}: {
  /** Tiến độ hôm nay của cả 4 category, theo đúng thứ tự CATEGORIES. */
  tiles: NowTile[];
  running: Set<Category>;
  busy: boolean;
  /** minutesAgo = 0 → bắt đầu ngay. */
  onStart: (category: Category, minutesAgo: number) => void;
  onFocusRunning: (category: Category) => void;
}) {
  const [sheetFor, setSheetFor] = useState<Category | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const down = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastScrollAt = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  // Lớp 2 của 6c: vừa cuộn xong thì mọi chạm đều đáng ngờ. `capture` để bắt cả
  // scroll của container con, `passive` để không cản cuộn.
  // Mọi mốc thời gian ở đây lấy từ `event.timeStamp`, không phải `Date.now()`:
  // cùng một đồng hồ (`performance.timeOrigin`), chỉ dùng để trừ nhau, và không
  // nhảy khi hệ thống chỉnh giờ giữa lúc ngón tay còn đang chạm.
  useEffect(() => {
    const onScroll = (e: Event) => {
      lastScrollAt.current = e.timeStamp;
      // Đang cuộn thì long-press không còn là long-press.
      clear();
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [clear]);

  const pressStart = (c: Category, e: React.PointerEvent) => {
    longFired.current = false;
    down.current = { x: e.clientX, y: e.clientY, at: e.timeStamp };
    clear();
    timer.current = setTimeout(() => {
      longFired.current = true;
      setSheetFor(c);
    }, LONG_PRESS_MS);
  };

  // Ngón đã đi xa thì đây là cú vuốt: huỷ luôn cả long-press.
  const pressMove = (e: React.PointerEvent) => {
    const d = down.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_LIMIT_PX) clear();
  };

  const cancel = () => {
    clear();
    down.current = null;
  };

  const press = (c: Category, e: React.PointerEvent) => {
    clear();
    const d = down.current;
    down.current = null;
    // Long-press đã mở sheet → bỏ qua click phát sinh kèm theo.
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    if (!d) return;
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
    if (running.has(c)) onFocusRunning(c);
    else onStart(c, 0);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => {
          const c = t.category;
          const isRunning = running.has(c);
          return (
            <button
              key={c}
              type="button"
              disabled={busy}
              onPointerDown={(e) => pressStart(c, e)}
              onPointerMove={pressMove}
              onPointerUp={(e) => press(c, e)}
              onPointerLeave={cancel}
              onPointerCancel={cancel}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={
                isRunning
                  ? `${CATEGORY_LABEL[c]} running, ${t.label}, tap to view`
                  : `Start ${CATEGORY_LABEL[c]}, ${t.label}`
              }
              className={[
                // Viền HAIRLINE xám cho mọi nút. Bốn viền pastel cạnh nhau là thứ
                // làm màn này rối - màu category thu về đúng một chấm tròn.
                'relative flex min-h-[72px] select-none flex-col items-start justify-center gap-1',
                'overflow-hidden rounded-md border border-line px-3 py-2 text-left transition md:min-h-[96px]',
                'touch-manipulation active:scale-[0.98] disabled:opacity-50',
                isRunning ? 'text-ink' : 'bg-surface-1 text-ink active:bg-surface-2',
              ].join(' ')}
              style={
                isRunning
                  ? { backgroundColor: catTint(c), borderColor: CATEGORY_COLOR[c], color: catInk(c) }
                  : undefined
              }
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: CATEGORY_COLOR[c] }}
                />
                <span className="text-sm font-medium md:text-base">{CATEGORY_LABEL[c]}</span>
              </span>

              <span className="text-xs tabular-nums text-ink-muted">{t.label}</span>

              {isRunning ? (
                <span className="absolute right-2 top-1.5 text-[10px] opacity-80">running</span>
              ) : null}

              {/* Dải tiến độ. Không target thì KHÔNG vẽ - một dải rỗng trông
                  như "chưa làm gì", trong khi thật ra hôm nay không đặt mục tiêu. */}
              {t.noTarget ? null : (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2"
                >
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${t.fill * 100}%`,
                      backgroundColor: CATEGORY_COLOR[c],
                    }}
                  />
                  {t.over ? (
                    <span
                      className="absolute inset-y-0 right-0"
                      style={{ width: `${OVER_PCT}%`, backgroundColor: OVER_COLOR }}
                    />
                  ) : null}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sheetFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Start with adjusted time"
          onClick={() => setSheetFor(null)}
        >
          <div
            className="w-full max-w-md rounded-t-lg bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            style={{ overscrollBehavior: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">
              Start {CATEGORY_LABEL[sheetFor]} with adjusted time
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              When did you actually start?
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {ADJUST_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="min-h-12 rounded-sm border border-line text-sm font-medium active:scale-[0.99]"
                  onClick={() => {
                    const c = sheetFor;
                    setSheetFor(null);
                    onStart(c, m);
                  }}
                >
                  started {m} minutes ago
                </button>
              ))}
              <button
                type="button"
                className="min-h-12 rounded-sm text-sm text-ink-soft"
                onClick={() => setSheetFor(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
