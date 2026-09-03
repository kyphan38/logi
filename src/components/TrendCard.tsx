'use client';

// ---------------------------------------------------------------------------
// logi - Trend: MỘT chủ đề qua nhiều kỳ (Stage 8)
//
// Ba chế độ, một khung:
// - Hours    : MỘT category qua nhiều kỳ (cũ). Cột = giờ đã log.
// - Bedtime  : mỗi tuần một điểm là trung vị giờ đi ngủ, kèm dải min-max.
// - Tasks    : tỉ lệ hoàn thành theo từng task - lộ ra task nào luôn bị bỏ.
//
// KHÔNG chồng 4 category lên nhau ở đây - "By day" đã làm việc đó rồi.
//
// Tuần không có dữ liệu thì ĐỂ TRỐNG, không vẽ cột 0: W31 "0.0h" trong khi app
// còn chưa dùng không phải là "học 0 giờ". Thiếu dữ liệu không phải dữ liệu
// bằng không - cùng luật với `sampleSize < 3` ở AI insights.
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
import { bedtimeStats, formatScale } from '@/lib/bedtime';
import { actualForRange, expectedForRange } from '@/lib/range-target';
import { weeksOf } from '@/lib/range';
import { useTrend, type TrendExtra } from '@/hooks/useTrend';
import { completionRate, expandPlan, tallyTasks } from '@/lib/tasks';
import {
  DEFAULT_SPAN,
  TREND_SPANS,
  elapsedFraction,
  hasLogged,
  trendBuckets,
  trendCompare,
  trendWindow,
  type TrendSpan,
} from '@/lib/trend';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

/** Một dropdown duy nhất cho "xem gì": 4 category + bedtime + tasks. */
type TrendSubject = Category | 'bedtime' | 'tasks';

const SUBJECT_OPTIONS: readonly { value: TrendSubject; label: string }[] = [
  ...CATEGORIES.map((c) => ({ value: c as TrendSubject, label: CATEGORY_LABEL[c] })),
  { value: 'bedtime' as TrendSubject, label: 'Bedtime' },
  { value: 'tasks' as TrendSubject, label: 'Tasks' },
];

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function extraOf(s: TrendSubject): TrendExtra {
  if (s === 'bedtime') return 'bedtime';
  if (s === 'tasks') return 'tasks';
  return 'none';
}

export default function TrendCard({ now }: { now: number }) {
  const [span, setSpan] = useState<TrendSpan>(DEFAULT_SPAN);
  const [subject, setSubject] = useState<TrendSubject>('learn');
  const mode = subject === 'bedtime' || subject === 'tasks' ? subject : 'category';
  const category: Category = mode === 'category' ? (subject as Category) : 'learn';
  const { activities, weekTargets, dayLogs, weekPlans, loading, error, reload } = useTrend(
    span,
    now,
    extraOf(subject)
  );

  const buckets = useMemo(() => trendBuckets(span, now), [span, now]);

  const controls = (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <CardSelect value={span} options={TREND_SPANS} onChange={setSpan} label="Trend period" />
      <CardSelect
        value={subject}
        options={SUBJECT_OPTIONS}
        onChange={setSubject}
        label="Trend subject"
      />
    </span>
  );

  return (
    <Card title="Trend" action={controls}>
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
      ) : mode === 'bedtime' ? (
        <BedtimeTrend buckets={buckets} dayLogs={dayLogs} />
      ) : mode === 'tasks' ? (
        <TaskTrend
          activities={activities}
          weekPlans={weekPlans}
          buckets={buckets}
          now={now}
        />
      ) : (
        <HoursTrend
          buckets={buckets}
          activities={activities}
          weekTargets={weekTargets}
          category={category}
          span={span}
          now={now}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hours - một category qua nhiều kỳ
// ---------------------------------------------------------------------------

interface HoursRow extends Record<string, unknown> {
  key: string;
  label: string;
  /** null = tuần chưa có dữ liệu: KHÔNG vẽ cột, không phải cột 0. */
  hours: number | null;
  target: number;
  partial: boolean;
  hasData: boolean;
}

function HoursTrend({
  buckets,
  activities,
  weekTargets,
  category,
  span,
  now,
}: {
  buckets: ReturnType<typeof trendBuckets>;
  activities: Parameters<typeof actualForRange>[0];
  weekTargets: Parameters<typeof expectedForRange>[1];
  category: Category;
  span: TrendSpan;
  now: number;
}) {
  const rows: HoursRow[] = useMemo(
    () =>
      buckets.map((b) => {
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

  const footnote =
    standard > 0
      ? `Bars are hours logged for ${CATEGORY_LABEL[category]}. Dashed line is the usual ${unit}: ${h1(standard)}h. * = this ${unit} is only ${donePct}% through.`
      : `Bars are hours logged for ${CATEGORY_LABEL[category]}. * = this ${unit} is only ${donePct}% through.`;

  return (
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
      <p className="mt-1 text-xs text-ink-muted">{footnote}</p>
    </>
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

// ---------------------------------------------------------------------------
// Bedtime - trung vị giờ đi ngủ mỗi tuần + dải min-max
// ---------------------------------------------------------------------------

function BedtimeTrend({
  buckets,
  dayLogs,
}: {
  buckets: ReturnType<typeof trendBuckets>;
  dayLogs: { date: string; bedtimeAt: number | null }[];
}) {
  const per = useMemo(
    () =>
      buckets.map((b) => {
        const stamps = dayLogs
          .filter((l) => l.date >= b.range.from && l.date <= b.range.to && l.bedtimeAt !== null)
          .map((l) => l.bedtimeAt as number);
        return { key: b.key, label: b.partial ? `${b.label}*` : b.label, stats: bedtimeStats(stamps) };
      }),
    [buckets, dayLogs]
  );

  const have = per.filter((p) => p.stats !== null);
  // Miền Y trên thang liên tục: 22:00 → 22, 00:15 → 24.25. Không quy đổi thì
  // 22:00 và 00:15 trung bình ra 11 giờ trưa.
  const lo = Math.floor(Math.min(...have.map((p) => p.stats!.min)) - 0.5);
  const hi = Math.ceil(Math.max(...have.map((p) => p.stats!.max)) + 0.5);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t++) ticks.push(t);

  const y = (v: number) => (hi === lo ? 50 : 100 - ((v - lo) / (hi - lo)) * 100);

  // Dòng so sánh chỉ giữa các tuần CÓ dữ liệu và đã xong. Dưới 2 thì ẩn.
  const usable = per.filter((p, i) => p.stats !== null && !buckets[i].partial);
  let read: string | null = null;
  if (usable.length >= 2 && have.length > 0) {
    const first = usable[0];
    const last = usable[usable.length - 1];
    const diffMin = Math.round((last.stats!.median - first.stats!.median) * 60);
    const word =
      Math.abs(diffMin) < 15 ? 'steady' : diffMin > 0 ? 'later' : 'earlier';
    read =
      word === 'steady'
        ? `${first.label} ${formatScale(first.stats!.median)} → ${last.label} ${formatScale(last.stats!.median)} · steady`
        : `${first.label} ${formatScale(first.stats!.median)} → ${last.label} ${formatScale(last.stats!.median)} · ${word} ${Math.abs(diffMin)}m`;
  }

  if (have.length === 0) {
    return (
      <>
        <p className="py-8 text-center text-[13px] text-ink-muted">
          No bedtimes logged in this period. Tap 🌙 bedtime in Now tonight.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Each week is the median bedtime, with the min–max range.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex h-48 w-full gap-1">
        <div className="relative w-10 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-1 text-[11px] tabular-nums text-ink-muted"
              style={{ top: `${y(t)}%`, transform: 'translateY(-50%)' }}
            >
              {formatScale(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex items-stretch justify-around">
            {per.map((p) =>
              p.stats === null ? (
                <div key={p.key} className="flex w-8 flex-col items-center justify-between py-1">
                  <span className="text-[11px] text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="text-[11px] text-ink-muted">{p.label}</span>
                </div>
              ) : (
                <div
                  key={p.key}
                  className="relative w-8"
                  title={`${p.label}: ${formatScale(p.stats.median)} (n=${p.stats.n})`}
                >
                  {/* Dải min-max */}
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded bg-indigo-300 dark:bg-indigo-700"
                    style={{ top: `${y(p.stats.max)}%`, height: `${Math.max(2, y(p.stats.min) - y(p.stats.max))}%` }}
                  />
                  {/* Điểm trung vị */}
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-500"
                    style={{ top: `calc(${y(p.stats.median)}% - 4px)` }}
                  />
                  <span className="absolute inset-x-0 bottom-0 text-center text-[11px] tabular-nums text-ink-muted">
                    {p.label}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {read ? (
        <p className="text-[13px] tabular-nums text-ink-soft">{read}</p>
      ) : null}
      <p className="mt-1 text-xs text-ink-muted">
        Dots are weekly medians, lines are min–max. Weeks with no bedtimes stay empty.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tasks - tỉ lệ hoàn thành theo từng task
// ---------------------------------------------------------------------------

function TaskTrend({
  activities,
  weekPlans,
  buckets,
  now,
}: {
  activities: Parameters<typeof tallyTasks>[1];
  weekPlans: Map<string, { week: string; cells: import('@/types/logi').PlannedCell[] }>;
  buckets: ReturnType<typeof trendBuckets>;
  now: number;
}) {
  const win = useMemo(() => trendWindow(buckets), [buckets]);

  const tallies = useMemo(() => {
    const plan = weeksOf(win).flatMap((w) => {
      const p = weekPlans.get(w);
      return p ? expandPlan(w, p.cells) : [];
    });
    return tallyTasks(plan, activities, win, now);
  }, [win, weekPlans, activities, now]);

  const rate = completionRate(tallies);
  const done = tallies.reduce((a, t) => a + t.completed, 0);
  const planned = tallies.reduce((a, t) => a + t.planned, 0);

  if (rate === null) {
    return (
      <>
        <p className="py-8 text-center text-[13px] text-ink-muted">
          No planned tasks in this period. Plan the week in Targets first.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Tasks you always skip are usually misplanned, not laziness.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-[13px] tabular-nums text-ink-soft">
        {done}/{planned} planned days done ·{' '}
        <span className="text-ink">{Math.round(rate * 100)}%</span>
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {tallies.map((t) => {
          const pct = t.planned > 0 ? t.completed / t.planned : 0;
          return (
            <li key={t.taskId}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate text-ink">{t.title}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {t.completed}/{t.planned} days
                </span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-1">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        Tasks you always skip are usually misplanned, not laziness.
      </p>
    </>
  );
}
