'use client';

// ============================================================
// logi — Timeline co giãn (Stage 4.5).
//
// Bố cục dòng chảy, KHÔNG `position: absolute` chồng nhau — block nào
// cũng bấm được. Khối có dữ liệu giữ chiều cao đọc được, khoảng trống
// thu về một dòng.
// ============================================================

import { useMemo } from 'react';

import { shortDate } from '@/lib/datetime';
import {
  elasticRows,
  formatGap,
  formatRange,
  GAP_ROW_PX,
  type DayWindow,
  type Gap,
  type Segment,
} from '@/lib/timeline';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

/** Cột nhãn giờ. Chỉ hiện giờ bắt đầu của mỗi hàng. */
const LABEL_W = 'w-[42px]';

const hhmm = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Timeline({
  segments,
  gaps,
  win,
  now,
  onSelect,
  onAdd,
}: {
  segments: Segment[];
  gaps: Gap[];
  win: DayWindow;
  now: number;
  onSelect: (a: Activity) => void;
  onAdd: () => void;
}) {
  const rows = useMemo(() => elasticRows(segments, gaps), [segments, gaps]);

  if (segments.length === 0) {
    return (
      <div className="w-full rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing tracked on this day.</p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium transition active:scale-[0.99] dark:border-zinc-700"
        >
          + Add record
        </button>
      </div>
    );
  }

  return (
    // Khoảng cách 8px giữa các hàng — cũng chính là cách thể hiện những
    // khoảng trống ngắn hơn 30 phút.
    <div className="w-full space-y-2 overflow-x-hidden">
      {rows.map((row) =>
        row.kind === 'gap' ? (
          <div key={row.key} className="flex items-stretch" style={{ height: GAP_ROW_PX }}>
            <div className={`${LABEL_W} shrink-0`} />
            <div className="flex min-w-0 flex-1 items-center justify-center rounded-md border border-dashed border-zinc-200 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
              {formatGap(row.end - row.start)} untracked
            </div>
          </div>
        ) : (
          <div key={row.key} className="flex items-stretch" style={{ height: row.height }}>
            <div
              className={`${LABEL_W} shrink-0 pr-2 pt-0.5 text-right text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500`}
            >
              {hhmm(row.start)}
            </div>
            <div className="flex min-w-0 flex-1 gap-1">
              {row.blocks.map((s) => (
                <Block key={s.activity.id} segment={s} now={now} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )
      )}
      <DayEnd win={win} now={now} />
    </div>
  );
}

function Block({
  segment: s,
  now,
  onSelect,
}: {
  segment: Segment;
  now: number;
  onSelect: (a: Activity) => void;
}) {
  const color = CATEGORY_COLOR[s.activity.category];
  const abandoned = s.activity.status === 'abandoned';
  const running = s.activity.endAt === null && s.end >= now - 60_000;

  return (
    <button
      type="button"
      onClick={() => onSelect(s.activity)}
      className={[
        'flex min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-r-md border-l-4 px-2 py-1 text-left transition active:scale-[0.99]',
        // Viền đứt phía trên = bị cắt đầu; phía dưới = bị cắt đuôi.
        s.continuedFromPrevious ? 'border-t border-dashed' : '',
        s.clippedEnd ? 'border-b border-dashed' : '',
      ].join(' ')}
      style={{
        borderLeftColor: color,
        borderTopColor: s.continuedFromPrevious ? color : undefined,
        borderBottomColor: s.clippedEnd ? color : undefined,
        backgroundColor: `${color}${abandoned ? '14' : '26'}`,
        opacity: abandoned ? 0.7 : 1,
        backgroundImage: abandoned
          ? 'repeating-linear-gradient(45deg, rgb(113 113 122 / 0.25) 0 4px, transparent 4px 9px)'
          : undefined,
      }}
    >
      <span className="block truncate text-[11px] font-semibold uppercase tracking-wide">
        {CATEGORY_LABEL[s.activity.category]}
        {abandoned ? ' · abandoned' : ''}
      </span>

      {s.continuedFromPrevious ? (
        <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
          cont. from {shortDate(s.activity.startAt)}
        </span>
      ) : null}

      {s.activity.label ? (
        <span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">
          {s.activity.label}
        </span>
      ) : null}

      {/* Thời lượng luôn viết bằng chữ — đó là thứ bù lại cho việc mất tỉ lệ. */}
      <span className="block truncate text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        {formatRange(s.start, s.end)}
        {running ? ' · running' : ''}
      </span>
    </button>
  );
}

/** Ngày hôm nay: một vạch mảnh cho biết đọc tới đây là hết. */
function DayEnd({ win, now }: { win: DayWindow; now: number }) {
  if (now <= win.start || now >= win.end) return null;
  return (
    <div className="flex items-center gap-2 pt-1" aria-hidden="true">
      <span className="w-[42px] pr-2 text-right text-[11px] tabular-nums text-zinc-400">
        {hhmm(now)}
      </span>
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      <span className="text-[11px] text-zinc-400">now</span>
    </div>
  );
}
