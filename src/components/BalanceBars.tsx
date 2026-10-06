'use client';

// ---------------------------------------------------------------------------
// logi - Balance bars (Stage 5 Task 3)
//
// The main chart. Answers two questions in one picture:
//   "How many hours did I spend on each thing?"  → bar length
//   "How far off the plan is that?"               → target tick + number on the right
//
// Plain div + CSS, NO Recharts: at 320px wide chart libraries tend to swallow
// the target tick or squeeze labels, and those two must never be wrong.
// ---------------------------------------------------------------------------
import { catInk } from '@/lib/category-style';
import type { RangeDeviation } from '@/lib/range-target';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

interface Props {
  rows: RangeDeviation[];
  /** Hide the gap column when the range lacks data to compare. */
  showDeviation?: boolean;
}

export default function BalanceBars({ rows, showDeviation = true }: Props) {
  // ONE scale for all 4 bars. A scale per bar would make Fitness 1.5h look as
  // long as Work 43h - pretty, but a lie.
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.expected)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <Bar key={r.category} row={r} max={max} showDeviation={showDeviation} />
      ))}
    </div>
  );
}

function Bar({
  row,
  max,
  showDeviation,
}: {
  row: RangeDeviation;
  max: number;
  showDeviation: boolean;
}) {
  const pct = (h: number) => `${Math.min(100, (h / max) * 100)}%`;
  const base = Math.min(row.actual, row.expected);
  const over = Math.max(0, row.actual - row.expected);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium" style={{ color: catInk(row.category) }}>
          {CATEGORY_LABEL[row.category]}
        </span>
        <span className="flex items-baseline gap-2 tabular-nums">
          <span className="text-[13px] text-ink">{row.actual.toFixed(1)}h</span>
          {showDeviation && <DeviationTag row={row} />}
        </span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-1">
        {/* The part within target */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct(base), background: CATEGORY_COLOR[row.category] }}
        />
        {/* The part over target: striped strong ink, distinct from every
            category color, in dark mode too (gray only, DESIGN.md). */}
        {over > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: pct(base),
              width: pct(over),
              backgroundColor: 'var(--text-primary)',
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--surface-0) 0 2px, transparent 2px 6px)',
            }}
          />
        )}
        {/* Target tick. On top so the bar never hides it. */}
        {row.expected > 0 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-ink"
            style={{ left: pct(row.expected) }}
            aria-hidden="true"
          />
        )}
      </div>

      <span className="sr-only">
        {CATEGORY_LABEL[row.category]}: {row.actual.toFixed(1)} hours logged, target{' '}
        {row.expected.toFixed(1)} hours
      </span>
    </div>
  );
}

function DeviationTag({ row }: { row: RangeDeviation }) {
  // balance.ts's double deadband: below the threshold, NO flag. An 8% gap is
  // the noise of tapping a few minutes late, not a signal.
  if (row.flag === 'ok') {
    return <span className="text-[13px] text-ink-muted">·</span>;
  }
  const up = row.flag === 'over';
  return (
    <span className="text-[13px] font-medium text-ink-soft">
      {up ? '↑' : '↓'} {Math.abs(Math.round(row.deltaPct * 100))}%
    </span>
  );
}

export function categoryOrder(): Category[] {
  // Work first: it is the longest bar, so the scale reads easier on top.
  return ['work', 'learn', 'fitness', 'leisure'];
}
