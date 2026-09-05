'use client';

import { useId, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import BalanceBars, { categoryOrder } from '@/components/BalanceBars';
import Card from '@/components/Card';
import LogQualityNote from '@/components/LogQualityNote';
import ExportSheet from '@/components/ExportSheet';
import Heatmap from '@/components/Heatmap';
import InsightPanel from '@/components/InsightPanel';
import StackedDays from '@/components/StackedDays';
import Tabs, { TabPanel } from '@/components/Tabs';
import TrendHoursCard from '@/components/TrendHoursCard';
import TrendSleepCard from '@/components/TrendSleepCard';
import TrendSpanChips from '@/components/TrendSpanChips';
import TrendTasksCard from '@/components/TrendTasksCard';
import WeekSleepCard from '@/components/WeekSleepCard';
import { useTick } from '@/hooks/useActivities';
import { fetchAllTime, useExportNudge } from '@/hooks/useBackup';
import { useRangeData } from '@/hooks/useRangeData';
import { useTrend } from '@/hooks/useTrend';
import { isThin, logQuality } from '@/lib/log-quality';
import { buildRange, rangeLabel } from '@/lib/range';
import {
  actualForRange,
  deviationsForRange,
  expectedForRange,
  overlapForRange,
} from '@/lib/range-target';
import { DEFAULT_SPAN, trendBuckets, type TrendSpan } from '@/lib/trend';

export default function AnalyticsPage() {
  // Ngày logic đổi lúc 04:00 nên phút là đủ mịn; giây chỉ làm chart nháy.
  const now = useTick(60_000, true);

  // Tab Week luôn là TUẦN NÀY. Bỏ "Last week" vì WeeklyReview đã lo việc nhìn
  // lại tuần trước, và bỏ "Custom" vì nó chỉ thật sự cần cho Export - ExportSheet
  // đã có sẵn lựa chọn "All time".
  const range = useMemo(() => buildRange('this_week', now), [now]);
  const [exporting, setExporting] = useState(false);
  const { activities, weekTargets, lateWeeks, loading, error, reload } = useRangeData(range);

  const base = useId();
  const [tab, setTab] = useState<'week' | 'trend'>('week');
  const [span, setSpan] = useState<TrendSpan>(DEFAULT_SPAN);

  // Gọi vô điều kiện (luật của hook). Nó chỉ chạy khi có `uid`; ở tab Week nó
  // vẫn fetch nền — chấp nhận, đổi lại bấm sang tab Trend là có ngay, và
  // `useTrend` đã có cache theo phiên.
  const buckets = useMemo(() => trendBuckets(span, now), [span, now]);
  const trend = useTrend(span, now);

  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { nudge, markDone } = useExportNudge(now);

  const view = useMemo(() => {
    const actual = actualForRange(activities, range, now);
    const expected = expectedForRange(range, weekTargets, now);
    const byCat = new Map(deviationsForRange(actual, expected).map((d) => [d.category, d]));
    return {
      rows: categoryOrder().map((c) => byCat.get(c)!),
      quality: logQuality(activities, range, now),
      overlap: overlapForRange(activities, range, now),
      logged: Object.values(actual).reduce((a, b) => a + b, 0),
    };
  }, [activities, weekTargets, range, now]);

  const empty = !loading && activities.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-[13px] text-ink-muted">{rangeLabel(range)}</p>
        </div>
        <button
          type="button"
          onClick={() => setExporting(true)}
          disabled={loading}
          className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98] disabled:opacity-40"
        >
          Export
        </button>
      </header>

      {/* Firestore free tier không tự backup. Nhắc mỗi Chủ nhật đầu tháng. */}
      {nudge.show && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-surface-1 p-3">
          <p className="min-w-0 text-[13px] text-ink-soft">{nudge.text}</p>
          <button
            type="button"
            onClick={() => setExporting(true)}
            className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
          >
            Back up
          </button>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-5 bg-surface-0 px-5 pb-3 pt-1">
        <Tabs
          base={base}
          label="Analytics view"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'week', label: 'Week' },
            { value: 'trend', label: 'Trend' },
          ]}
        />
        {tab === 'trend' && (
          <div className="mt-2">
            <TrendSpanChips value={span} onChange={setSpan} />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-surface-1 p-3">
          <p className="min-w-0 text-[13px] text-ink-soft">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      )}

      {tab === 'week' ? (
        <TabPanel base={base} value="week">
          {loading ? (
            <Skeleton />
          ) : empty ? (
            <EmptyState />
          ) : (
            <>
              {/* Chất lượng log đứng TRƯỚC mọi chart: log thưa thì các con
                  số bên dưới không nói lên điều gì, phải biết trước khi đọc. */}
              <LogQualityNote quality={view.quality} overlap={view.overlap} />

              <Card
                title="Balance"
                footnote="One scale for all four bars. The notch is the target for this range."
              >
                <BalanceBars rows={view.rows} showDeviation={!isThin(view.quality)} />
              </Card>

              <Card
                title="By day"
                footnote="Y axis is hours, not % of a day - logging two things at once can push a column past 24h."
              >
                <StackedDays
                  activities={activities}
                  range={range}
                  weekTargets={weekTargets}
                  lateWeeks={lateWeeks}
                  now={now}
                />
              </Card>

              <Card title="By hour" footnote="Darker cell = more hours logged in that hour.">
                <Heatmap activities={activities} range={range} now={now} />
              </Card>

              <WeekSleepCard range={range} />

              {/* Sau chart, không phải trước: chart trả lời "cái gì đã xảy ra",
                  phần này chỉ chọn ra cái đáng để ý. Đọc ngược lại thì người dùng
                  tin lời AI hơn tin số của chính mình. */}
              <InsightPanel
                activities={activities}
                range={range}
                weekTargets={weekTargets}
                now={now}
              />
            </>
          )}
        </TabPanel>
      ) : (
        <TabPanel base={base} value="trend">
          {trend.error ? (
            <Card label="Trend">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-[13px] text-ink-soft">{trend.error}</p>
                <button
                  type="button"
                  onClick={trend.reload}
                  className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
                >
                  Retry
                </button>
              </div>
            </Card>
          ) : trend.loading ? (
            <Skeleton />
          ) : (
            <>
              <TrendHoursCard
                buckets={buckets}
                activities={trend.activities}
                weekTargets={trend.weekTargets}
                now={now}
              />
              <TrendTasksCard
                buckets={buckets}
                activities={trend.activities}
                weekPlans={trend.weekPlans}
                now={now}
              />
              <TrendSleepCard buckets={buckets} dayLogs={trend.dayLogs} />
            </>
          )}
        </TabPanel>
      )}

      {exporting && (
        <ExportSheet
          activities={activities}
          range={range}
          weekTargets={weekTargets}
          now={now}
          onClose={() => setExporting(false)}
          loadAllTime={uid ? () => fetchAllTime(uid) : undefined}
          onExported={markDone}
        />
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-busy="true" aria-label="Loading">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="h-3 w-20 rounded-sm bg-surface-1" />
          <div className="h-3 w-full rounded-full bg-surface-1" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-10 text-center">
      <p className="text-sm text-ink-soft">Nothing logged this week.</p>
      <p className="text-[13px] text-ink-muted">Start a session in Now.</p>
    </div>
  );
}
