'use client';

import { useEffect, useMemo, useRef } from 'react';

import { addDays } from '@/lib/timeline';
import { CATEGORY_COLOR, type Category } from '@/types/logi';

/** Một đoạn của thanh mini: category + phần trăm giờ đã log của ngày đó. */
export interface DayBar {
  c: Category;
  pct: number;
}

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dow: dt.toLocaleDateString([], { weekday: 'short' }),
    day: dt.getDate(),
  };
}

export default function DateStrip({
  today,
  selected,
  bars,
  onSelect,
}: {
  /** Ngày logic hôm nay. */
  today: string;
  selected: string;
  /** date → tỉ lệ category. Thiếu key = ngày chưa log gì. */
  bars: Record<string, DayBar[]>;
  onSelect: (date: string) => void;
}) {
  // 7 ngày gần nhất, cũ → mới (hôm nay ở cuối).
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Mở ra là thấy hôm nay ngay.
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth });
  }, [today]);

  return (
    <div className="flex items-center gap-2">
      <div
        ref={scroller}
        className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d) => {
          const { dow, day } = parts(d);
          const active = d === selected;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              aria-current={active ? 'date' : undefined}
              className={[
                'flex min-h-[52px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs transition',
                active
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400',
              ].join(' ')}
            >
              <span>{dow}</span>
              <span className="text-sm font-semibold">{day}</span>
              {/* Lướt ngang là thấy ngay ngày nào bị Work nuốt hết. */}
              <span
                aria-hidden="true"
                className="flex w-7 overflow-hidden rounded-full"
                style={{ height: active ? 6 : 4 }}
              >
                {(bars[d] ?? []).length > 0 ? (
                  bars[d].map((b) => (
                    <span
                      key={b.c}
                      style={{ width: `${b.pct}%`, backgroundColor: CATEGORY_COLOR[b.c] }}
                    />
                  ))
                ) : (
                  <span className="w-full bg-zinc-200 dark:bg-zinc-700" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <label className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span className="sr-only">Pick a date</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        <input
          type="date"
          value={selected}
          max={today}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          className="absolute inset-0 h-full w-full opacity-0"
        />
      </label>
    </div>
  );
}
