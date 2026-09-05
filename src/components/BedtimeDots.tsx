'use client';

// ---------------------------------------------------------------------------
// logi - Chấm giờ đi ngủ trên thang liên tục
//
// Dùng ở hai chỗ với hai câu hỏi khác nhau:
//   - tab Week  : mỗi cột là MỘT đêm  → "tuần này tôi ngủ thế nào"
//   - tab Trend : mỗi cột là MỘT tuần → "mấy tháng nay tôi ngủ sớm lên chưa"
//
// Không dùng Recharts: trục Y ở đây là thang 20:00→04:00 (`bedtimeScale`), qua
// nửa đêm vẫn tăng đều. Nhét vào Recharts phải tự viết formatter cho cả tick,
// tooltip lẫn domain - dựng tay bằng absolute còn ít code hơn.
//
// Cột trống ĐỂ TRỐNG, không kéo về 0: đêm không ghi không phải đêm ngủ lúc
// 20:00. Cùng luật với cột trống ở Trend và `sampleSize < 3` bên AI insights.
// ---------------------------------------------------------------------------
import { formatScale } from '@/lib/bedtime';
import type { BedtimeStats } from '@/lib/bedtime';

export interface BedtimePoint {
  key: string;
  label: string;
  /** `null` = kỳ chưa ghi đêm nào. */
  stats: BedtimeStats | null;
}

export default function BedtimeDots({
  points,
  labelEvery = 1,
}: {
  points: readonly BedtimePoint[];
  /** Chỉ ghi nhãn mỗi N cột. Nhiều cột quá thì nhãn chồng lên nhau. */
  labelEvery?: number;
}) {
  const have = points.filter((p) => p.stats !== null);
  if (have.length === 0) return null;

  // Miền Y trên thang liên tục: 22:00 → 22, 00:15 → 24.25. Không quy đổi thì
  // 22:00 và 00:15 trung bình ra 11 giờ trưa.
  const lo = Math.floor(Math.min(...have.map((p) => p.stats!.min)) - 0.5);
  const hi = Math.ceil(Math.max(...have.map((p) => p.stats!.max)) + 0.5);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t++) ticks.push(t);

  const y = (v: number) => (hi === lo ? 50 : 100 - ((v - lo) / (hi - lo)) * 100);

  return (
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
        <div className="absolute inset-0 flex items-stretch">
          {points.map((p, i) => {
            // `flex-1 min-w-0` chứ không phải `w-8`: 26 cột × 32px = 832px, vượt
            // khung 375px và không có thanh cuộn ngang nên chữ bên trong bị vỡ.
            const label = i % labelEvery === 0 ? p.label : '';
            return p.stats === null ? (
              <div
                key={p.key}
                className="flex min-w-0 flex-1 flex-col items-center justify-between py-1"
              >
                <span className="text-[11px] text-zinc-300 dark:text-zinc-700">·</span>
                <span className="truncate text-[11px] text-ink-muted">{label}</span>
              </div>
            ) : (
              <div
                key={p.key}
                className="relative min-w-0 flex-1"
                title={`${p.label}: ${formatScale(p.stats.median)} (n=${p.stats.n})`}
              >
                {/* Dải min-max */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded bg-indigo-300 dark:bg-indigo-700"
                  style={{
                    top: `${y(p.stats.max)}%`,
                    height: `${Math.max(2, y(p.stats.min) - y(p.stats.max))}%`,
                  }}
                />
                {/* Điểm trung vị */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-500"
                  style={{ top: `calc(${y(p.stats.median)}% - 4px)` }}
                />
                <span className="absolute inset-x-0 bottom-0 truncate text-center text-[11px] tabular-nums text-ink-muted">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
