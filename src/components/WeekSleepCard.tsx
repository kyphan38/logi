'use client';

// ---------------------------------------------------------------------------
// logi - THIS WEEK's sleep (Week tab)
//
// Same shape as the Sleep card on the Trend tab, different question: here each
// column is ONE night ("how did I sleep this week"), there each is one week
// ("have I gone to bed earlier lately"). Different questions, so no duplication.
//
// For one night median = min = max, so the min-max whisker shrinks to the dot.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';

import BedtimeDots, { type BedtimePoint } from '@/components/BedtimeDots';
import Card from '@/components/Card';
import { bedtimeStats, formatScale } from '@/lib/bedtime';
import { useWeekBedtime } from '@/hooks/useWeekBedtime';
import type { Range } from '@/lib/range';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Median of the medians, computed DIRECTLY on the continuous scale.
 *
 * Do not convert back to timestamps for `bedtimeStats`: `bedtimeStats` takes
 * epoch ms while `stats.median` is already a scale value (22:00 → 22, 00:15 →
 * 24.25). Multiplying the scale by 3_600_000 and passing it in mixes units -
 * no error, just meaningless numbers.
 */
function medianScale(pts: BedtimePoint[]): number {
  const s = pts.map((p) => p.stats!.median).sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[i] : (s[i - 1] + s[i]) / 2;
}

export default function WeekSleepCard({ range }: { range: Range }) {
  const { logs, loading } = useWeekBedtime(range.from, range.to);

  const points: BedtimePoint[] = useMemo(() => {
    const out: BedtimePoint[] = [];
    // Walk by DAY, not by the log array: an unlogged night must stay empty, not
    // vanish, or an empty Wednesday would push Thursday into its slot.
    const [y, m, d] = range.from.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(y, m - 1, d + i);
      const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (date > range.to) break;
      const log = logs.find((l) => l.date === date);
      out.push({
        key: date,
        label: DOW[i],
        stats: log?.bedtimeAt != null ? bedtimeStats([log.bedtimeAt]) : null,
      });
    }
    return out;
  }, [logs, range.from, range.to]);

  const have = points.filter((p) => p.stats !== null);

  if (loading) {
    return (
      <Card title="Sleep">
        <div className="h-48 w-full animate-pulse rounded-md bg-surface-1" aria-busy="true" />
      </Card>
    );
  }

  if (have.length === 0) {
    return (
      <Card title="Sleep">
        <p className="py-8 text-center text-[13px] text-ink-muted">
          No bedtimes logged this week. Tap &quot;bedtime&quot; in Now tonight.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Sleep" footnote="One dot per night. Lower = later.">
      {/* 7 columns leave room to print the time right by each dot - no hover
          tooltip needed, which phones do not have anyway. */}
      <BedtimeDots points={points} showValue />
      <p className="text-[13px] tabular-nums text-ink-soft">
        {have.length}/{points.length} nights logged · median{' '}
        <span className="text-ink">{formatScale(medianScale(have))}</span>
      </p>
    </Card>
  );
}
