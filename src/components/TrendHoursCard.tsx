'use client';

// ---------------------------------------------------------------------------
// logi - Trend giờ của MỘT category qua nhiều tuần
//
// Bar trả lời "nhiều hay ít so với target", line trả lời "đang lên hay xuống".
// Đổi giữa hai kiểu bởi SỐ CỘT chứ không bởi span: span đã bị cắt đầu nên
// không đoán được số cột từ tên span.
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
  elapsedFraction,
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
  /** null = tuần chưa có dữ liệu: KHÔNG vẽ cột, không phải cột 0. */
  hours: number | null;
  target: number;
  partial: boolean;
  hasData: boolean;
}

interface PctRow extends Record<string, unknown> {
  key: string;
  label: string;
  /** null = tuần chưa có dữ liệu hoặc không đặt target: làm ĐỨT đường. */
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

  // Cắt TRƯỚC khi tính rows: standard, donePct và dòng so sánh đều phải tính
  // trên cửa sổ đã cắt, không phải trên 26 tuần đầy chỗ trống.
  const shown = useMemo(
    () => trimLeadingEmpty(buckets, (b) => hasLogged(activities, b.range)),
    [buckets, activities]
  );

  const rows: HoursRow[] = useMemo(
    () =>
      shown.map((b) => {
        // Kỳ có ít nhất một session (không tính abandoned/scheduled) mới là
        // "có dữ liệu". Chưa dùng app thì cột trống, không phải 0 giờ.
        const hasData = hasLogged(activities, b.range);
        return {
          key: b.key,
          // Kỳ đang chạy được đánh dấu ngay trên trục: người đọc thấy cột thấp
          // trước khi kịp đọc chú thích ở đáy khung.
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

  // Đường chuẩn lấy từ các kỳ ĐÃ XONG. Gộp cả kỳ dở dang vào thì đường tự tụt
  // xuống mỗi sáng thứ Hai, và cột nào cũng "đạt".
  const closed = rows.filter((r) => !r.partial && r.target > 0);
  const standard = closed.length
    ? closed.reduce((a, r) => a + r.target, 0) / closed.length
    : 0;

  const color = CATEGORY_COLOR[category];
  const last = shown[shown.length - 1];
  const donePct = Math.round(elapsedFraction(last, now) * 100);

  // Span dài vẽ TỈ LỆ chứ không vẽ giờ: qua 26 tuần target đổi nhiều lần, đường
  // chuẩn theo giờ sẽ nhấp nhô khó đọc, còn mốc 100% thì luôn nằm một chỗ.
  const pctRows: PctRow[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    pct: onTrackPct(r.hours, r.target),
    partial: r.partial,
  }));

  const footnote =
    kind === 'line'
      ? `Each point is hours logged ÷ target for that week. 100% = on target. * = this week is only ${donePct}% through.`
      : standard > 0
        ? `Bars are hours logged for ${CATEGORY_LABEL[category]}. Dashed line is the usual week: ${h1(standard)}h. * = this week is only ${donePct}% through.`
        : `Bars are hours logged for ${CATEGORY_LABEL[category]}. * = this week is only ${donePct}% through.`;

  return (
    <Card title="Hours" action={controls} footnote={footnote}>
      {kind === 'bars' ? (
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
                    // Tooltip gọn cho mobile: "23.3h of 6.0h". Bỏ chữ "target" -
                    // footnote dưới chart đã nói đường đứt là target tuần.
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
                {/* connectNulls mặc định false - tuần trống phải làm ĐỨT đường, nối qua
                    chỗ trống là vẽ ra một tuần chưa từng xảy ra. */}
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
 * Một dòng chữ nói thẳng xu hướng. Chart cho thấy hình dạng; dòng này cho
 * con số, để không phải đoán từ chiều cao cột. Chỉ so giữa các kỳ CÓ dữ liệu:
 * tuần trống không phải là 0.
 */
function TrendRead({ rows }: { rows: HoursRow[] }) {
  // Kỳ dở dang loại ra như cũ; thêm điều kiện có dữ liệu - thiếu một trong hai
  // thì dòng so sánh là bịa. Quy tắc nằm trong `trend.ts` để test được.
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

/** Như `TrendRead` nhưng cho chế độ line: đơn vị là điểm phần trăm. */
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
