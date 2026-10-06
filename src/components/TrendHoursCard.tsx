'use client';

// ---------------------------------------------------------------------------
// logi - Hours trend of ONE category across weeks
//
// Bars answer "more or less than target", a line answers "going up or down".
// The switch depends on the COLUMN COUNT, not the span: the span is trimmed
// at the start, so its name does not tell the column count.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import Card, { CardSelect } from '@/components/Card';
import { actualForRange, expectedForRange } from '@/lib/range-target';
import {
  chartKind,
  hasLogged,
  labelInterval,
  onTrackPct,
  trendCompare,
  trimLeadingEmpty,
  type TrendBucket,
} from '@/lib/trend';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

interface HoursRow extends Record<string, unknown> {
  key: string;
  label: string;
  /** null = no data that week: draw NO bar, not a 0 bar. */
  hours: number | null;
  target: number;
  partial: boolean;
  hasData: boolean;
}

interface PctRow extends Record<string, unknown> {
  key: string;
  label: string;
  /** null = no data that week or no target: BREAK the line. */
  pct: number | null;
  partial: boolean;
}

export default function TrendHoursCard({
  buckets,
  activities,
  weekTargets,
  now,
}: {
  buckets: TrendBucket[];
  activities: Parameters<typeof actualForRange>[0];
  weekTargets: Parameters<typeof expectedForRange>[1];
  now: number;
}) {
  const [category, setCategory] = useState<Category>('learn');

  const controls = (
    <CardSelect
      value={category}
      options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
      onChange={setCategory}
      label="Category"
    />
  );

  // Trim BEFORE computing rows: standard and the comparison line must
  // use the trimmed window, not 26 weeks full of gaps.
  const shown = useMemo(
    () => trimLeadingEmpty(buckets, (b) => hasLogged(activities, b.range)),
    [buckets, activities]
  );

  const rows: HoursRow[] = useMemo(
    () =>
      shown.map((b) => {
        // A period counts as "has data" only with at least one session (not
        // abandoned/scheduled). Before using the app, the bar is empty, not 0 hours.
        const hasData = hasLogged(activities, b.range);
        return {
          key: b.key,
          // The running period is marked right on the axis: readers see the low
          // bar before they reach the footnote at the bottom.
          label: b.partial ? `${b.label}*` : b.label,
          hours: hasData ? actualForRange(activities, b.range, now)[category] : null,
          target: expectedForRange(b.range, weekTargets, now)[category],
          partial: b.partial,
          hasData,
        };
      }),
    [shown, activities, weekTargets, category, now]
  );

  const kind = chartKind(rows.length);

  if (shown.length === 0) {
    return (
      <Card title="Hours" action={controls}>
        <p className="py-8 text-center text-[13px] text-ink-muted">
          Nothing logged in this period.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Weeks before your first log are hidden.
        </p>
      </Card>
    );
  }

  // The standard line comes from FINISHED periods. Including the unfinished one
  // drags the line down every Monday morning, and every bar "hits" it.
  const closed = rows.filter((r) => !r.partial && r.target > 0);
  const standard = closed.length
    ? closed.reduce((a, r) => a + r.target, 0) / closed.length
    : 0;

  const color = CATEGORY_COLOR[category];

  // Long spans plot RATIOS, not hours: over 26 weeks the target changes many
  // times, an hours line would wobble, while the 100% mark stays put.
  const pctRows: PctRow[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    pct: onTrackPct(r.hours, r.target),
    partial: r.partial,
  }));

  const footnote =
    kind === 'line'
      ? `Hours ÷ target. * = week in progress.`
      : standard > 0
        ? `Dashed = usual week (${h1(standard)}h). * = week in progress.`
        : `Hours for ${CATEGORY_LABEL[category]}. * = week in progress.`;

  return (
    <Card title="Hours" action={controls} footnote={footnote}>
      {kind === 'bars' ? (
        <>
          {/* Fixed height: ResponsiveContainer needs a parent with a real height;
              left to shrink, the chart becomes 0px on iOS and disappears. */}
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval={labelInterval(rows.length)}
                />
                <YAxis
                  width={34}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}h`}
                />
                <Tooltip
                  cursor={{ fill: 'var(--border)' }}
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--text-secondary)' }}
                  formatter={(v, _n, item) => {
                    const r = item?.payload as HoursRow | undefined;
                    if (v === null || v === undefined || r?.hasData === false) {
                      return ['no data', CATEGORY_LABEL[category]];
                    }
                    // A compact mobile tooltip: "23.3h of 6.0h". No "target" -
                    // the footnote already says the dashed line is the weekly target.
                    const tgt = r && r.target > 0 ? ` of ${h1(r.target)}h` : '';
                    return [`${h1(Number(v))}h${tgt}`, CATEGORY_LABEL[category]];
                  }}
                />

                {standard > 0 && (
                  <ReferenceLine
                    y={standard}
                    stroke="var(--text-muted)"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                )}

                <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                  {rows.map((r) => (
                    // The unfinished period is lighter: same color, so the same
                    // thing, but the eye does not compare it with the full bars.
                    <Cell key={r.key} fill={color} fillOpacity={r.partial ? 0.35 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Direct labels for both ends: nobody can read "12h or 14h" from the
              Y axis, and that is the only question this box answers. */}
          <TrendRead rows={rows} />
        </>
      ) : (
        <>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pctRows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval={labelInterval(pctRows.length)}
                />
                <YAxis
                  width={38}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v)}%`}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--border-strong)' }}
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--text-secondary)' }}
                  formatter={(v) =>
                    v === null || v === undefined
                      ? ['no data', CATEGORY_LABEL[category]]
                      : [`${Math.round(Number(v))}% of target`, CATEGORY_LABEL[category]]
                  }
                />
                <ReferenceLine
                  y={100}
                  stroke="var(--text-muted)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
                {/* connectNulls defaults to false - an empty week must BREAK the
                    line; joining across it draws a week that never happened. */}
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2, fill: color }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <TrendReadPct rows={pctRows} />
        </>
      )}
    </Card>
  );
}

/**
 * One line stating the trend plainly. The chart shows the shape; this line
 * gives the number, so nobody guesses from bar heights. Only compares periods
 * WITH data: an empty week is not 0.
 */
function TrendRead({ rows }: { rows: HoursRow[] }) {
  // The unfinished period is excluded as before; plus the has-data rule - miss
  // either and the comparison is made up. The rule lives in `trend.ts` to be tested.
  const cmp = trendCompare(rows);
  if (!cmp) return null;

  const { from: first, to: last, diff, word } = cmp;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';

  return (
    <p className="text-[13px] tabular-nums text-ink-soft">
      {first.label} {h1(first.hours ?? 0)}h → {last.label} {h1(last.hours ?? 0)}h ·{' '}
      <span className="text-ink">
        {word}
        {word === 'flat' ? '' : ` ${sign}${h1(Math.abs(diff))}h`}
      </span>
    </p>
  );
}

/** Like `TrendRead` but for line mode: the unit is percentage points. */
function TrendReadPct({ rows }: { rows: PctRow[] }) {
  const cmp = trendCompare(
    rows.map((r) => ({ label: r.label, hours: r.pct, partial: r.partial })),
    5
  );
  if (!cmp) return null;

  const { from: first, to: last, diff, word } = cmp;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';

  return (
    <p className="text-[13px] tabular-nums text-ink-soft">
      {first.label} {Math.round(first.hours ?? 0)}% → {last.label} {Math.round(last.hours ?? 0)}% ·{' '}
      <span className="text-ink">
        {word}
        {word === 'flat' ? '' : ` ${sign}${Math.round(Math.abs(diff))}%`}
      </span>
    </p>
  );
}
