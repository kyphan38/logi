'use client';

// ---------------------------------------------------------------------------
// logi - 24h × day heatmap (Stage 5 Task 5)
//
// Div + CSS grid. Recharts has no such chart, and CSS handles a grid of
// squares far more neatly.
//
// Mobile has NO hover, so details open on tap - tapping a cell shows one line
// right under the grid, no floating tooltip.
//
// Columns are CALENDAR days and rows are real clock hours (00:00 → 23:00),
// unlike category totals (logical days, 04:00 cut). See heatmap.ts.
// ---------------------------------------------------------------------------
import { useState } from 'react';

import { dayLabel } from '@/lib/bucket';
import { heatmapFits, heatmapOf, MAX_HEATMAP_DAYS, type Cell } from '@/lib/heatmap';
import type { Range } from '@/lib/range';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

const LEGEND: Category[] = ['work', 'learn', 'fitness', 'leisure'];

interface Props {
  activities: Activity[];
  range: Range;
  now: number;
}

export default function Heatmap({ activities, range, now }: Props) {
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);

  if (!heatmapFits(range)) {
    return (
      <p className="text-[13px] text-ink-muted">
        Heatmap available for ranges up to {MAX_HEATMAP_DAYS} days.
      </p>
    );
  }

  const { days, hours, grid } = heatmapOf(activities, range, now);
  const cell = picked ? grid[picked.row][picked.col] : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid gap-px"
        // Columns shrink with the day count; rows are a fixed 18px so every hour compares.
        style={{ gridTemplateColumns: `2.25rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {/* First row: day labels */}
        <div />
        {days.map((d) => (
          <div key={d} className="truncate text-center text-[10px] text-ink-muted">
            {dayLabel(d)}
          </div>
        ))}

        {grid.map((cells, row) => (
          <Row
            key={hours[row]}
            hour={hours[row]}
            cells={cells}
            days={days}
            // Only label every 4 hours, or the hour column gets crowded.
            showLabel={row % 4 === 0}
            picked={picked?.row === row ? picked.col : null}
            onPick={(col) =>
              setPicked((p) => (p && p.row === row && p.col === col ? null : { row, col }))
            }
          />
        ))}
      </div>

      <p className="min-h-4 text-[11px] tabular-nums text-ink-soft" aria-live="polite">
        {picked && cell
          ? cell.category
            ? `${dayLabel(days[picked.col])} ${hours[picked.row]} - ${CATEGORY_LABEL[cell.category]}, ${Math.round(cell.minutes)} min`
            : `${dayLabel(days[picked.col])} ${hours[picked.row]} - nothing logged`
          : ''}
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND.map((c) => (
          <span key={c} className="flex items-center gap-1 text-[11px] text-ink-soft">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ background: CATEGORY_COLOR[c] }}
              aria-hidden="true"
            />
            {CATEGORY_LABEL[c]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({
  hour,
  cells,
  days,
  showLabel,
  picked,
  onPick,
}: {
  hour: string;
  cells: Cell[];
  days: string[];
  showLabel: boolean;
  picked: number | null;
  onPick: (col: number) => void;
}) {
  return (
    <>
      <div className="h-[18px] pr-1 text-right text-[10px] leading-[18px] text-ink-muted">
        {showLabel ? hour : ''}
      </div>
      {cells.map((c, col) => (
        <button
          key={days[col]}
          type="button"
          onClick={() => onPick(col)}
          aria-label={`${days[col]} ${hour}${c.category ? `, ${CATEGORY_LABEL[c.category]}` : ', empty'}`}
          className={[
            'h-[18px] rounded-[2px] transition',
            picked === col ? 'ring-1 ring-ink' : '',
            c.category ? '' : 'bg-surface-1',
          ].join(' ')}
          style={
            c.category
              ? {
                  backgroundColor: CATEGORY_COLOR[c.category],
                  // A cell with 15 logged minutes must be lighter than a full
                  // 60. The 0.25 floor keeps a small dot visible.
                  opacity: 0.25 + 0.75 * Math.min(1, c.minutes / 60),
                }
              : undefined
          }
        />
      ))}
    </>
  );
}
