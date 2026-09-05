'use client';

// ---------------------------------------------------------------------------
// logi - Giấc ngủ của TUẦN NÀY (tab Week)
//
// Cùng hình với card Sleep bên tab Trend nhưng khác câu hỏi: ở đây mỗi cột là
// MỘT đêm ("tuần này tôi ngủ thế nào"), bên kia mỗi cột là một tuần ("mấy tháng
// nay tôi ngủ sớm lên chưa"). Hai câu hỏi khác nhau nên không phải trùng lặp.
//
// Một đêm thì median = min = max, nên râu min-max thu thành đúng cái chấm.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';

import BedtimeDots, { type BedtimePoint } from '@/components/BedtimeDots';
import Card from '@/components/Card';
import { bedtimeStats, formatScale } from '@/lib/bedtime';
import { useWeekBedtime } from '@/hooks/useWeekBedtime';
import type { Range } from '@/lib/range';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Trung vị của các trung vị, tính THẲNG trên thang liên tục.
 *
 * Không quay ngược về timestamp để gọi `bedtimeStats`: `bedtimeStats` nhận
 * epoch ms còn `stats.median` đã là scale (22:00 → 22, 00:15 → 24.25). Nhân
 * scale với 3_600_000 rồi đưa vào là trộn hai đơn vị - không ném lỗi, chỉ ra
 * số vô nghĩa.
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
    // Đi theo NGÀY chứ không theo mảng log: đêm không ghi phải để trống chứ
    // không biến mất, nếu không thì thứ Tư trống sẽ đẩy thứ Năm sang chỗ của nó.
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
          No bedtimes logged this week. Tap 🌙 bedtime in Now tonight.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Sleep"
      footnote="One dot per night. Nights with no bedtime stay empty."
    >
      <BedtimeDots points={points} />
      <p className="text-[13px] tabular-nums text-ink-soft">
        {have.length}/{points.length} nights logged · median{' '}
        <span className="text-ink">{formatScale(medianScale(have))}</span>
      </p>
    </Card>
  );
}
