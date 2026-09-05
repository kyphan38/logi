'use client';

// ---------------------------------------------------------------------------
// logi - Chấm giờ đi ngủ trên thang liên tục
//
// Dùng ở hai chỗ với hai câu hỏi khác nhau:
//   - tab Week  : mỗi cột là MỘT đêm  → "tuần này tôi ngủ thế nào"
//   - tab Trend : mỗi cột là MỘT tuần → "mấy tháng nay tôi ngủ sớm lên chưa"
//
// Không dùng Recharts: trục Y ở đây là thang liên tục (`bedtimeScale`), qua
// nửa đêm vẫn tăng đều. Nhét vào Recharts phải tự viết formatter cho cả tick,
// tooltip lẫn domain - dựng tay bằng absolute còn ít code hơn.
//
// CHIỀU TRỤC: 21:00 ở TRÊN, 04:00 ở DƯỚI. Ngủ muộn hơn thì chấm TỤT XUỐNG -
// đọc thẳng "tuần này tôi tụt dốc" mà không phải dịch trong đầu. Đây là chiều
// ngược với chart giờ làm (cao = nhiều), nên đừng gộp hai cái làm một.
//
// Miền cố định 21:00→04:00 chứ không co theo dữ liệu: co theo dữ liệu thì tuần
// ngủ đều 23:00-23:30 sẽ giãn hết khung trông y hệt tuần ngủ 21:00-04:00. Cùng
// một khung mọi tuần thì hình dáng mới so được với nhau. Chỉ nới ra khi có mốc
// nằm ngoài - nới còn hơn giấu mất một đêm.
//
// Cột trống ĐỂ TRỐNG, không kéo về 0: đêm không ghi không phải đêm ngủ lúc
// 20:00. Cùng luật với cột trống ở Trend và `sampleSize < 3` bên AI insights.
// ---------------------------------------------------------------------------
import { formatScale } from '@/lib/bedtime';
import type { BedtimeStats } from '@/lib/bedtime';

/** Đỉnh khung: 21:00. Trên thang liên tục thì 21:00 = 21. */
const FLOOR_LO = 21;
/** Đáy khung: 04:00 hôm sau = 24 + 4 = 28. */
const FLOOR_HI = 28;

export interface BedtimePoint {
  key: string;
  label: string;
  /** `null` = kỳ chưa ghi đêm nào. */
  stats: BedtimeStats | null;
}

export default function BedtimeDots({
  points,
  labelEvery = 1,
  showValue = false,
}: {
  points: readonly BedtimePoint[];
  /** Chỉ ghi nhãn mỗi N cột. Nhiều cột quá thì nhãn chồng lên nhau. */
  labelEvery?: number;
  /** Hiện giờ cụ thể cạnh mỗi chấm. Chỉ bật khi ít cột - 7 đêm thì vừa, 26 tuần thì chồng chữ. */
  showValue?: boolean;
}) {
  const have = points.filter((p) => p.stats !== null);
  if (have.length === 0) return null;

  // Miền Y trên thang liên tục: 22:00 → 22, 00:15 → 24.25. Không quy đổi thì
  // 22:00 và 00:15 trung bình ra 11 giờ trưa.
  const lo = Math.min(FLOOR_LO, Math.floor(Math.min(...have.map((p) => p.stats!.min))));
  const hi = Math.max(FLOOR_HI, Math.ceil(Math.max(...have.map((p) => p.stats!.max))));
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t++) ticks.push(t);

  // Muộn hơn = xuống thấp hơn, nên KHÔNG lật dấu như chart giờ làm.
  const y = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);

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
                {/* Dải min-max. Sớm nhất ở TRÊN nên `top` lấy theo min. */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded bg-indigo-300 dark:bg-indigo-700"
                  style={{
                    top: `${y(p.stats.min)}%`,
                    height: `${Math.max(2, y(p.stats.max) - y(p.stats.min))}%`,
                  }}
                />
                {/* Điểm trung vị */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-500"
                  style={{ top: `calc(${y(p.stats.median)}% - 4px)` }}
                />
                {showValue && (
                  // Chữ nằm TRÊN chấm, trừ khi chấm đã sát đỉnh thì lật xuống
                  // dưới - không thì chữ tràn ra ngoài khung và bị cắt.
                  <span
                    className="absolute inset-x-0 truncate text-center text-[10px] tabular-nums text-ink-soft"
                    style={
                      y(p.stats.median) < 14
                        ? { top: `calc(${y(p.stats.median)}% + 8px)` }
                        : { top: `calc(${y(p.stats.median)}% - 18px)` }
                    }
                  >
                    {formatScale(p.stats.median)}
                  </span>
                )}
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
