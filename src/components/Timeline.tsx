'use client';
// ===========================================================================
// logi - Elastic timeline (Stage 4.5 Task 2) + token-based blocks (4.6 Task 5).
//
// The layout is a flow, NOT overlapping `position: absolute` - every block
// hugs the left edge. Long gaps merge into one "untracked" row.
//
// Look: `tint` fill, a 3px LEFT border in the base color, no surrounding border.
// The Label line is NOT shown here - labels are still stored and still
// editable in RecordSheet, the timeline just is not the place to read them.
// ===========================================================================
import { useMemo } from 'react';
import {
  elasticRows,
  formatClockRange,
  formatGap,
  GAP_ROW_PX,
  type DayWindow,
  type Gap,
  type Segment,
} from '@/lib/timeline';
import { catInk, catTint } from '@/lib/category-style';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

/** The hour column on the left. */
const LABEL_W = 'w-[42px]';

/** Under a minute counts as a mistap - shown faint, not bold. */
const ZERO_MS = 60_000;

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
      <div className="w-full space-y-2">
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
  // A sub-minute record: almost always a start-stop mistap.
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
        // A 3px LEFT border in the base color - enough to tell the category, no surrounding border.
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
        {/* Sleep 22:00 → 04:30: one single block, only noted as crossing days. */}
        {!zero && s.crossesMidnight ? (
          <span className="text-ink-muted"> → next day</span>
        ) : null}
        {zero ? '' : ` · ${formatGap(s.end - s.start)}`}
        {running ? ' · running' : ''}
      </span>
    </button>
  );
}

/** Today: the "now" mark sits at the end of the list, not a line drawn over it. */
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
