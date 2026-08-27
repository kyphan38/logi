'use client';

import { useMemo } from 'react';

import {
  formatGap,
  formatRange,
  toPx,
  HOUR_PX,
  MIN_BLOCK_PX,
  type DayWindow,
  type Gap,
  type Segment,
} from '@/lib/timeline';
import { shortDate } from '@/lib/datetime';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

const GUTTER = 'ml-11'; // chừa chỗ cho cột giờ bên trái

export default function Timeline({
  segments,
  laneCount,
  gaps,
  win,
  now,
  onSelect,
}: {
  segments: Segment[];
  laneCount: number;
  gaps: Gap[];
  win: DayWindow;
  now: number;
  onSelect: (a: Activity) => void;
}) {
  // Vạch giờ mỗi 2 tiếng: 04:00 → 04:00 hôm sau.
  const ticks = useMemo(
    () => Array.from({ length: 13 }, (_, i) => ({ hour: i * 2, ts: win.start + i * 2 * 3_600_000 })),
    [win],
  );

  const nowPx = now > win.start && now < win.end ? toPx(now, win) : null;

  return (
    <div className="relative" style={{ height: 24 * HOUR_PX }}>
      {/* Vạch giờ + nhãn */}
      {ticks.map((t) => (
        <div key={t.hour} className="absolute inset-x-0" style={{ top: toPx(t.ts, win) }}>
          <span className="absolute -top-2 left-0 w-9 text-right text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
            {new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className={`${GUTTER} border-t border-zinc-100 dark:border-zinc-800`} />
        </div>
      ))}

      {/* Khoảng trống > 30 phút */}
      {gaps.map((g) => {
        const top = toPx(g.start, win);
        const height = toPx(g.end, win) - top;
        return (
          <div
            key={g.start}
            className={`${GUTTER} absolute right-0 flex items-center justify-center rounded-md text-[11px] text-zinc-400 dark:text-zinc-600`}
            style={{
              top,
              height,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgb(161 161 170 / 0.10) 0 6px, transparent 6px 12px)',
            }}
          >
            {height >= 28 ? `untracked · ${formatGap(g.end - g.start)}` : null}
          </div>
        );
      })}

      {/* Block — mỗi lane một cột, không đè lên nhau nên bấm được hết */}
      <div className={`${GUTTER} absolute inset-y-0 right-0`}>
        {segments.map((s) => {
          const top = toPx(s.start, win);
          const height = Math.max(MIN_BLOCK_PX, toPx(s.end, win) - top);
          const color = CATEGORY_COLOR[s.activity.category];
          const abandoned = s.activity.status === 'abandoned';
          const compact = height < 40;

          return (
            <button
              key={s.activity.id}
              type="button"
              onClick={() => onSelect(s.activity)}
              className={[
                'absolute overflow-hidden rounded-r-md border-l-4 px-2 text-left transition active:scale-[0.99]',
                // Kéo sang từ hôm trước → viền đứt ở trên cho biết block bị cắt đầu.
                s.continuedFromPrevious ? 'border-t border-dashed' : '',
              ].join(' ')}
              style={{
                top,
                height,
                left: `${(s.lane * 100) / laneCount}%`,
                width: `calc(${100 / laneCount}% - 2px)`,
                borderLeftColor: color,
                borderTopColor: s.continuedFromPrevious ? color : undefined,
                backgroundColor: `${color}${abandoned ? '14' : '26'}`,
                opacity: abandoned ? 0.7 : 1,
                backgroundImage: abandoned
                  ? 'repeating-linear-gradient(45deg, rgb(113 113 122 / 0.25) 0 4px, transparent 4px 9px)'
                  : undefined,
              }}
            >
              <span className="block truncate text-[11px] font-semibold uppercase tracking-wide">
                {s.continuedFromPrevious ? '↥ ' : ''}
                {CATEGORY_LABEL[s.activity.category]}
                {abandoned ? ' · abandoned' : ''}
                {s.clippedEnd ? ' ↧' : ''}
              </span>
              {s.continuedFromPrevious ? (
                <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  cont. from {shortDate(s.activity.startAt)}
                </span>
              ) : null}
              {!compact ? (
                <>
                  {s.activity.label ? (
                    <span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">
                      {s.activity.label}
                    </span>
                  ) : null}
                  <span className="block truncate text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatRange(s.start, s.end)}
                    {s.activity.endAt === null ? ' · running' : ''}
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Vạch "bây giờ" */}
      {nowPx !== null ? (
        <div className="absolute inset-x-0 z-10" style={{ top: nowPx }} aria-hidden="true">
          <div className={`${GUTTER} border-t border-red-500`} />
          <div className="absolute left-9 -top-1 h-2 w-2 rounded-full bg-red-500" />
        </div>
      ) : null}
    </div>
  );
}
