'use client';

// ---------------------------------------------------------------------------
// logi - Giấc ngủ qua nhiều tuần (tab Trend)
//
// Cùng hình với card Sleep bên tab Week nhưng khác câu hỏi: ở đây mỗi cột là
// MỘT tuần ("mấy tháng nay tôi ngủ sớm lên chưa"), bên kia mỗi cột là một đêm.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';

import BedtimeDots from '@/components/BedtimeDots';
import Card from '@/components/Card';
import { bedtimeStats, formatScale } from '@/lib/bedtime';
import { MAX_BARS, trimLeadingEmpty, type TrendBucket } from '@/lib/trend';
import type { DayLog } from '@/types/logi';

export default function TrendSleepCard({
  buckets,
  dayLogs,
}: {
  buckets: TrendBucket[];
  dayLogs: DayLog[];
}) {
  // Cắt TRƯỚC khi vẽ: tuần chưa dùng app không phải tuần ngủ lúc 20:00.
  const shown = useMemo(
    () =>
      trimLeadingEmpty(
        buckets,
        (b) => dayLogs.some((l) => l.date >= b.range.from && l.date <= b.range.to && l.bedtimeAt !== null)
      ),
    [buckets, dayLogs]
  );

  const points = useMemo(
    () =>
      shown.map((b) => {
        const stamps = dayLogs
          .filter((l) => l.date >= b.range.from && l.date <= b.range.to && l.bedtimeAt !== null)
          .map((l) => l.bedtimeAt as number);
        return { key: b.key, label: b.partial ? `${b.label}*` : b.label, stats: bedtimeStats(stamps) };
      }),
    [shown, dayLogs]
  );

  const have = points.filter((p) => p.stats !== null);

  // Dòng so sánh chỉ giữa các tuần CÓ dữ liệu và đã xong. Dưới 2 thì ẩn.
  const usable = points.filter((p, i) => p.stats !== null && !shown[i].partial);
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
      <Card title="Sleep">
        <p className="py-8 text-center text-[13px] text-ink-muted">
          No bedtimes logged in this period. Tap 🌙 bedtime in Now tonight.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Each week is the median bedtime, with the min–max range.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Sleep"
      footnote="Dots are weekly medians, lines are min–max. Weeks with no bedtimes stay empty; weeks before your first log are hidden."
    >
      <BedtimeDots points={points} labelEvery={points.length > MAX_BARS ? 4 : 1} />
      {read ? (
        <p className="text-[13px] tabular-nums text-ink-soft">{read}</p>
      ) : null}
    </Card>
  );
}
