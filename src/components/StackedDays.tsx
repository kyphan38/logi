'use client';

// ---------------------------------------------------------------------------
// logi - Stacked bar theo ngày / theo tuần (Stage 5 Task 4)
//
// Trục Y là GIỜ, không phải % của 24h: có overlap nên tổng một ngày hoàn toàn
// có thể vượt 24. Ép về % sẽ phải cắt bớt, tức là nói dối.
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
  /** Tuần bị đổi target muộn - số liệu vẫn đúng nhưng target thì đã đổi giữa chừng. */
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

  // Đường ngang = trung bình target của MỘT cột trong khoảng này. Không lấy
  // 129.5/7 cứng: khoảng có thể toàn ngày thường hoặc toàn cuối tuần.
  const avg = averageTarget(buckets, weekTargets, now);
  const hasLate = buckets.some((b) => lateWeeks.has(b.key));

  return (
    <div className="flex flex-col gap-2">
      {/* Chiều cao cố định: ResponsiveContainer cần cha có chiều cao thật,
          nếu để nó tự co thì trên iOS chart sẽ ra 0px và biến mất. */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* `left: -20` kéo nhãn trục Y ra ngoài khung, "4h" bị cắt còn "ih".
              Để 0 và tự đặt `width` cho YAxis (AMENDMENT-remove-sleep mục 7). */}
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
