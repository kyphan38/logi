'use client';

// ---------------------------------------------------------------------------
// logi - Stacked bars by day / by week (Stage 5 Task 4)
//
// The Y axis is HOURS, not % of 24h: with overlap a day's total can exceed 24.
// Forcing it into % would mean cutting, i.e. lying.
// ---------------------------------------------------------------------------
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { bucketsOf, type Bucket } from '@/lib/bucket';
import type { Range } from '@/lib/range';
import { actualForRange, expectedForRange } from '@/lib/range-target';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

const STACK: Category[] = ['work', 'learn', 'fitness', 'leisure'];

interface Row extends Record<string, unknown> {
  key: string;
  label: string;
  late: boolean;
}

interface Props {
  activities: Activity[];
  range: Range;
  weekTargets: Map<string, Record<Category, number>>;
  /** A week whose target changed late - the numbers are right, but the target moved midway. */
  lateWeeks: Set<string>;
  now: number;
}

export default function StackedDays({ activities, range, weekTargets, lateWeeks, now }: Props) {
  const buckets = bucketsOf(range, now);
  const rows: Row[] = buckets.map((b) => {
    const actual = actualForRange(activities, b.range, now);
    return {
      key: b.key,
      label: lateWeeks.has(b.key) ? `${b.label}*` : b.label,
      late: lateWeeks.has(b.key),
      ...actual,
    };
  });

  // The horizontal line = the average target of ONE column in this range. Not a
  // fixed 89/7: a range may be all weekdays or all weekend.
  const avg = averageTarget(buckets, weekTargets, now);
  const hasLate = buckets.some((b) => lateWeeks.has(b.key));

  return (
    <div className="flex flex-col gap-2">
      {/* Fixed height: ResponsiveContainer needs a parent with a real height;
          left to shrink, the chart becomes 0px on iOS and disappears. */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* `left: -20` pushed Y-axis labels out of the frame, "4h" became "ih".
              Use 0 and set the YAxis `width` (AMENDMENT-remove-sleep section 7). */}
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval="preserveStartEnd"
              minTickGap={4}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={30}
              unit="h"
              tickFormatter={(v: number) => String(Math.round(v))}
            />
            <Tooltip content={<StackTooltip />} cursor={{ fill: 'var(--surface-1)' }} />
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
            )}
            {STACK.map((c) => (
              <Bar key={c} dataKey={c} stackId="a" fill={CATEGORY_COLOR[c]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Legend />
      {hasLate && (
        <p className="text-[11px] text-ink-muted">* target for this week was changed late.</p>
      )}
    </div>
  );
}

function averageTarget(
  buckets: Bucket[],
  weekTargets: Map<string, Record<Category, number>>,
  now: number
): number {
  if (buckets.length === 0) return 0;
  let sum = 0;
  for (const b of buckets) {
    const exp = expectedForRange(b.range, weekTargets, now);
    sum += Object.values(exp).reduce((a, v) => a + v, 0);
  }
  return sum / buckets.length;
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number;
}

function StackTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((a, p) => a + (p.value ?? 0), 0);

  return (
    <div className="rounded-md border border-line bg-surface-2 p-2 text-[12px] shadow-sm">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload
        .filter((p) => (p.value ?? 0) > 0.05)
        .map((p) => (
          <p key={String(p.dataKey)} className="flex justify-between gap-3 tabular-nums">
            <span style={{ color: CATEGORY_COLOR[p.dataKey as Category] }}>
              {CATEGORY_LABEL[p.dataKey as Category]}
            </span>
            <span className="text-ink-soft">{(p.value ?? 0).toFixed(1)}h</span>
          </p>
        ))}
      <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 tabular-nums text-ink-soft">
        <span>Total</span>
        <span>{total.toFixed(1)}h</span>
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {STACK.map((c) => (
        <span key={c} className="flex items-center gap-1 text-[11px] text-ink-soft">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: CATEGORY_COLOR[c] }}
            aria-hidden="true"
          />
          {CATEGORY_LABEL[c]}
        </span>
      ))}
    </div>
  );
}
