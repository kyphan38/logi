'use client';

// ---------------------------------------------------------------------------
// logi - Trend: MỘT category qua nhiều kỳ
//
// Một series, một trục. KHÔNG chồng 4 category lên nhau ở đây - "By day" đã
// làm việc đó rồi, và bốn đường trên một hình thì không đọc được xu hướng của
// đường nào cả. Đổi category bằng dropdown, không bằng thêm màu.
//
// Cột = giờ đã log. Đường đứt ngang = target trung bình của một kỳ trong cửa
// sổ này, để biết cột cao hay thấp là so với cái gì.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import Card, { CardSelect } from '@/components/Card';
import { actualForRange, expectedForRange } from '@/lib/range-target';
import { useTrend } from '@/hooks/useTrend';
import {
  DEFAULT_SPAN,
  TREND_SPANS,
  elapsedFraction,
  trendBuckets,
  type TrendSpan,
} from '@/lib/trend';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

const CAT_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

interface Row extends Record<string, unknown> {
  key: string;
  label: string;
  hours: number;
  target: number;
  partial: boolean;
}

export default function TrendCard({ now }: { now: number }) {
  const [span, setSpan] = useState<TrendSpan>(DEFAULT_SPAN);
  const [category, setCategory] = useState<Category>('learn');
  const { activities, weekTargets, loading, error, reload } = useTrend(span, now);

  const buckets = useMemo(() => trendBuckets(span, now), [span, now]);

  const rows: Row[] = useMemo(
    () =>
      buckets.map((b) => ({
        key: b.key,
        // Kỳ đang chạy được đánh dấu ngay trên trục: người đọc thấy cột thấp
        // trước khi kịp đọc chú thích ở đáy khung.
        label: b.partial ? `${b.label}*` : b.label,
        hours: actualForRange(activities, b.range, now)[category],
        target: expectedForRange(b.range, weekTargets, now)[category],
        partial: b.partial,
      })),
    [buckets, activities, weekTargets, category, now]
  );

  // Đường chuẩn lấy từ các kỳ ĐÃ XONG. Gộp cả kỳ dở dang vào thì đường tự tụt
  // xuống mỗi sáng thứ Hai, và cột nào cũng "đạt".
  const closed = rows.filter((r) => !r.partial && r.target > 0);
  const standard = closed.length
    ? closed.reduce((a, r) => a + r.target, 0) / closed.length
    : 0;

  const color = CATEGORY_COLOR[category];
  const unit = span.endsWith('w') ? 'week' : 'month';
  const last = buckets[buckets.length - 1];
  const donePct = Math.round(elapsedFraction(last, now) * 100);

  const controls = (
    <span className="flex items-center gap-2">
      <CardSelect value={span} options={TREND_SPANS} onChange={setSpan} label="Trend period" />
      <CardSelect
        value={category}
        options={CAT_OPTIONS}
        onChange={setCategory}
        label="Trend category"
      />
    </span>
  );

  const footnote =
    standard > 0
      ? `Bars are hours logged for ${CATEGORY_LABEL[category]}. Dashed line is the usual ${unit}: ${h1(standard)}h. * = this ${unit} is only ${donePct}% through.`
      : `Bars are hours logged for ${CATEGORY_LABEL[category]}. * = this ${unit} is only ${donePct}% through.`;

  return (
    <Card title="Trend" action={controls} footnote={!loading && !error ? footnote : undefined}>
      {error ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[13px] text-ink-soft">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="h-48 w-full animate-pulse rounded-md bg-surface-1" aria-busy="true" />
      ) : (
        <>
          {/* Chiều cao cố định: ResponsiveContainer cần cha có chiều cao thật,
              để nó tự co thì trên iOS chart ra 0px và biến mất. */}
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval={0}
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
                    const r = item?.payload as Row | undefined;
                    const tgt = r && r.target > 0 ? ` of ${h1(r.target)}h target` : '';
                    return [`${h1(Number(v ?? 0))}h${tgt}`, CATEGORY_LABEL[category]];
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
                    // Kỳ dở dang nhạt hơn: cùng một màu nên vẫn là cùng một
                    // thứ, nhưng mắt không so nó ngang hàng với các cột đã đủ.
                    <Cell key={r.key} fill={color} fillOpacity={r.partial ? 0.35 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Nhãn trực tiếp cho hai đầu: không ai đọc được "cột này 12h hay
              14h" từ trục Y, mà đó lại là câu hỏi duy nhất của ô này. */}
          <TrendRead rows={rows} />
        </>
      )}
    </Card>
  );
}

/**
 * Một dòng chữ nói thẳng xu hướng. Chart cho thấy hình dạng; dòng này cho
 * con số, để không phải đoán từ chiều cao cột.
 */
function TrendRead({ rows }: { rows: Row[] }) {
  const closed = rows.filter((r) => !r.partial);
  if (closed.length < 2) return null;

  const first = closed[0];
  const last = closed[closed.length - 1];
  const diff = last.hours - first.hours;
  const word = Math.abs(diff) < 0.5 ? 'flat' : diff > 0 ? 'up' : 'down';
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';

  return (
    <p className="text-[13px] tabular-nums text-ink-soft">
      {first.label} {h1(first.hours)}h → {last.label} {h1(last.hours)}h ·{' '}
      <span className="text-ink">
        {word}
        {word === 'flat' ? '' : ` ${sign}${h1(Math.abs(diff))}h`}
      </span>
    </p>
  );
}
