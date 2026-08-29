'use client';

import { useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import BalanceBars, { categoryOrder } from '@/components/BalanceBars';
import LogQualityNote from '@/components/LogQualityNote';
import ExportSheet from '@/components/ExportSheet';
import Heatmap from '@/components/Heatmap';
import InsightPanel from '@/components/InsightPanel';
import RangePicker from '@/components/RangePicker';
import RangeTable from '@/components/RangeTable';
import StackedDays from '@/components/StackedDays';
import { useTick } from '@/hooks/useActivities';
import { fetchAllTime, useExportNudge } from '@/hooks/useBackup';
import { useRangeData } from '@/hooks/useRangeData';
import { bucketMode } from '@/lib/bucket';
import { isThin, logQuality } from '@/lib/log-quality';
import { buildRange, rangeLabel, type Range } from '@/lib/range';
import {
  actualForRange,
  deviationsForRange,
  expectedForRange,
  overlapForRange,
} from '@/lib/range-target';

export default function AnalyticsPage() {
  // Ngày logic đổi lúc 04:00 nên phút là đủ mịn; giây chỉ làm chart nháy.
  const now = useTick(60_000, true);

  // Mặc định `this_week`: Analytics chỉ có nghĩa từ 2 ngày trở lên (mục 8.1).
  const [range, setRange] = useState<Range>(() => buildRange('this_week', Date.now()));
  const [exporting, setExporting] = useState(false);
  const { activities, weekTargets, lateWeeks, loading, error, reload } = useRangeData(range);

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
  const singleDay = range.from === range.to;

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

      <RangePicker value={range} onChange={setRange} now={now} />

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

      {loading ? (
        <Skeleton />
      ) : empty ? (
        <EmptyState onThisWeek={() => setRange(buildRange('this_week', now))} />
      ) : (
        <>
          {/* Bảng đứng trước - câu hỏi hay gặp nhất là "khoảng này tôi thế nào". */}
          <RangeTable activities={activities} range={range} weekTargets={weekTargets} now={now} />

          {/* Chất lượng log đứng TRƯỚC mọi chart: log thưa thì các con
              số bên dưới không nói lên điều gì, phải biết trước khi đọc. */}
          <LogQualityNote quality={view.quality} overlap={view.overlap} />

          <section className="flex flex-col gap-3">
            <h2 className="text-[13px] font-medium text-ink-soft">Balance</h2>
            <BalanceBars rows={view.rows} showDeviation={!isThin(view.quality)} />
          </section>

          {/* Khoảng một ngày: By day một cột và When một cột đều không nói lên
              điều gì mà History không nói rõ hơn (mục 8.1). */}
          {singleDay ? (
            <p className="text-[13px] text-ink-muted">
              Pick 2+ days to see daily and hourly patterns.
            </p>
          ) : (
            <>
              <section className="flex flex-col gap-3">
                <h2 className="text-[13px] font-medium text-ink-soft">By {bucketMode(range)}</h2>
                <StackedDays
                  activities={activities}
                  range={range}
                  weekTargets={weekTargets}
                  lateWeeks={lateWeeks}
                  now={now}
                />
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-[13px] font-medium text-ink-soft">When</h2>
                <Heatmap activities={activities} range={range} now={now} />
              </section>
            </>
          )}

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

function EmptyState({ onThisWeek }: { onThisWeek: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-10 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-ink-soft">Nothing logged in this period.</p>
        <p className="text-[13px] text-ink-muted">Try a range where you have records.</p>
      </div>
      <button
        type="button"
        onClick={onThisWeek}
        className="rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
      >
        This week
      </button>
    </div>
  );
}
