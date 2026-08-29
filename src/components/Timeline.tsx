'use client';
// ===========================================================================
// logi - Timeline co giãn (Stage 4.5 Task 2) + block theo token (4.6 Task 5).
//
// Bố cục là dòng chảy, KHÔNG `position: absolute` chồng nhau - block nào cũng
// bám mép trái. Khoảng trống dài gộp thành một hàng "untracked".
//
// Hình thức: nền `tint`, viền TRÁI 3px màu gốc, không viền bao quanh.
// KHÔNG hiện dòng Label ở đây - label vẫn lưu trong DB và vẫn sửa được trong
// RecordSheet, chỉ là timeline không phải chỗ để đọc nó.
// ===========================================================================
import { useMemo } from 'react';
import { shortDate } from '@/lib/datetime';
import {
  elasticRows,
  formatClockRange,
  formatGap,
  GAP_ROW_PX,
  type AsleepRow,
  type DayWindow,
  type Gap,
  type Segment,
} from '@/lib/timeline';
import { catInk, catTint } from '@/lib/category-style';
import { logicalDate } from '@/lib/balance';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

/** Cột giờ bên trái. */
const LABEL_W = 'w-[42px]';

/** Dưới một phút thì coi như bấm nhầm - hiện nhạt đi, không tô đậm. */
const ZERO_MS = 60_000;

const hhmm = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Timeline({
  segments,
  gaps,
  win,
  now,
  asleep,
  onSelect,
  onSelectDay,
  onAdd,
}: {
  segments: Segment[];
  gaps: Gap[];
  win: DayWindow;
  now: number;
  /** Đầu ngày còn đang ngủ - giấc đó thuộc ngày hôm trước. */
  asleep?: AsleepRow | null;
  onSelect: (a: Activity) => void;
  onSelectDay?: (date: string) => void;
  onAdd: () => void;
}) {
  const rows = useMemo(() => elasticRows(segments, gaps), [segments, gaps]);

  if (segments.length === 0) {
    return (
      <div className="w-full space-y-2">
        {asleep ? <Asleep row={asleep} onSelectDay={onSelectDay} /> : null}
        <div className="rounded-md border border-dashed border-line-strong px-4 py-10 text-center">
          <p className="text-sm text-ink-muted">Nothing tracked on this day.</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 min-h-11 rounded-sm border border-line px-4 text-sm font-medium transition active:scale-[0.99]"
          >
            + Add record
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 overflow-x-hidden">
      {asleep ? <Asleep row={asleep} onSelectDay={onSelectDay} /> : null}
      {rows.map((row) =>
        row.kind === 'gap' ? (
          <div key={row.key} className="flex items-stretch" style={{ height: GAP_ROW_PX }}>
            <div className={`${LABEL_W} shrink-0`} />
            <div className="flex min-w-0 flex-1 items-center justify-center rounded-md border border-dashed border-line-strong text-[11px] text-ink-muted">
              {formatGap(row.end - row.start)} untracked
            </div>
          </div>
        ) : (
          <div key={row.key} className="flex items-stretch" style={{ height: row.height }}>
            <div
              className={`${LABEL_W} shrink-0 pr-2 pt-0.5 text-right text-[11px] tabular-nums text-ink-muted`}
            >
              {hhmm(row.start)}
            </div>
            <div className="flex min-w-0 flex-1 gap-1">
              {row.blocks.map((s) => (
                <Block key={s.activity.id} segment={s} now={now} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ),
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
  const c = s.activity.category;
  const abandoned = s.activity.status === 'abandoned';
  const running = s.activity.endAt === null && s.end >= now - 60_000;
  // Record dưới một phút: gần như luôn là bấm nhầm start-stop.
  const zero = s.activity.endAt !== null && s.end - s.start < ZERO_MS;

  return (
    <button
      type="button"
      onClick={() => onSelect(s.activity)}
      className={[
        'flex min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-md',
        'px-2 py-1 text-left transition active:scale-[0.99]',
      ].join(' ')}
      style={{
        // Viền TRÁI 3px màu gốc - đủ để nhận ra category, không cần viền bao quanh.
        borderLeft: `3px solid ${CATEGORY_COLOR[c]}`,
        backgroundColor: catTint(c),
        color: catInk(c),
        opacity: abandoned ? 0.7 : 1,
        backgroundImage: abandoned
          ? 'repeating-linear-gradient(45deg, rgb(113 113 122 / 0.25) 0 4px, transparent 4px 9px)'
          : undefined,
      }}
    >
      <span className="block truncate text-[13px] font-semibold">
        {CATEGORY_LABEL[c]}
        {abandoned ? ' · abandoned' : ''}
      </span>
      <span
        className={`block truncate text-[11px] tabular-nums ${zero ? 'text-ink-muted' : 'opacity-80'}`}
      >
        {zero ? '0m' : formatClockRange(s.start, s.end)}
        {/* Ngủ 22:00 → 04:30: một block duy nhất, chỉ ghi chú là qua ngày. */}
        {!zero && s.crossesMidnight ? (
          <span className="text-ink-muted"> → next day</span>
        ) : null}
        {zero ? '' : ` · ${formatGap(s.end - s.start)}`}
        {running ? ' · running' : ''}
      </span>
    </button>
  );
}

/**
 * Hàng mảnh đầu ngày: "Asleep until 7:30 AM (logged Aug 25)".
 * Không phải block - không bấm được, không tính vào tổng của ngày này. Chỉ
 * ngày trong ngoặc là bấm được, để nhảy sang ngày đã log giấc ngủ đó.
 */
function Asleep({
  row,
  onSelectDay,
}: {
  row: AsleepRow;
  onSelectDay?: (date: string) => void;
}) {
  const day = logicalDate(row.activity.startAt);
  return (
    <div className="flex items-stretch">
      <div className={`${LABEL_W} shrink-0`} />
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md bg-surface-0 px-3 py-1.5 text-[11px] text-ink-muted">
        <span className="truncate">Asleep until {hhmm(row.end)}</span>
        {onSelectDay ? (
          <button
            type="button"
            onClick={() => onSelectDay(day)}
            className="shrink-0 underline decoration-dotted underline-offset-2"
          >
            (logged {shortDate(row.activity.startAt)})
          </button>
        ) : (
          <span className="shrink-0">(logged {shortDate(row.activity.startAt)})</span>
        )}
      </div>
    </div>
  );
}

/** Ngày hôm nay: mốc "bây giờ" nằm cuối danh sách, không phải một đường kẻ đè lên. */
function DayEnd({ win, now }: { win: DayWindow; now: number }) {
  if (now <= win.start || now >= win.end) return null;
  return (
    <div className="flex items-center gap-2 pt-1" aria-hidden="true">
      <span className={`${LABEL_W} pr-2 text-right text-[11px] tabular-nums text-ink-muted`}>
        {hhmm(now)}
      </span>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] text-ink-muted">now</span>
    </div>
  );
}
