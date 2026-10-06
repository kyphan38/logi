'use client';

// ---------------------------------------------------------------------------
// logi - Bedtime dots on a continuous scale
//
// Used in two places for two different questions:
//   - Week tab  : each column is ONE night → "how did I sleep this week"
//   - Trend tab : each column is ONE week  → "have I gone to bed earlier lately"
//
// No Recharts: the Y axis is a continuous scale (`bedtimeScale`) that keeps
// rising past midnight. In Recharts that means custom formatters for ticks,
// tooltip and domain - absolute positioning by hand is less code.
//
// AXIS DIRECTION: 21:00 at the TOP, 04:00 at the BOTTOM. Later bedtime = the dot
// DROPS - reads directly as "this week I slipped" with no mental flip. This is
// the opposite of the hours chart (high = more), so never merge the two.
//
// The domain is fixed at 21:00→04:00, not fitted to data: fitted, a steady
// 23:00-23:30 week would stretch to fill the frame and look like a 21:00-04:00
// week. Only one frame for every week makes shapes comparable. It only widens
// when a mark falls outside - widening beats hiding a night.
//
// Empty columns STAY EMPTY, not pulled to 0: an unlogged night is not a night
// asleep at 20:00. Same rule as empty Trend columns and `sampleSize < 3` in AI insights.
// ---------------------------------------------------------------------------
import { formatScale } from '@/lib/bedtime';
import type { BedtimeStats } from '@/lib/bedtime';

/** Top of the frame: 21:00. On the continuous scale 21:00 = 21. */
const FLOOR_LO = 21;
/** Bottom of the frame: 04:00 next day = 24 + 4 = 28. */
const FLOOR_HI = 28;

export interface BedtimePoint {
  key: string;
  label: string;
  /** `null` = no night logged in this period. */
  stats: BedtimeStats | null;
}

export default function BedtimeDots({
  points,
  labelEvery = 1,
  showValue = false,
}: {
  points: readonly BedtimePoint[];
  /** Only label every N columns. Too many columns and labels overlap. */
  labelEvery?: number;
  /** Show the exact time next to each dot. Only with few columns - 7 nights fit, 26 weeks overlap. */
  showValue?: boolean;
}) {
  const have = points.filter((p) => p.stats !== null);
  if (have.length === 0) return null;

  // Y domain on the continuous scale: 22:00 → 22, 00:15 → 24.25. Without the
  // conversion, 22:00 and 00:15 average out to 11 am.
  const lo = Math.min(FLOOR_LO, Math.floor(Math.min(...have.map((p) => p.stats!.min))));
  const hi = Math.max(FLOOR_HI, Math.ceil(Math.max(...have.map((p) => p.stats!.max))));
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t++) ticks.push(t);

  // Later = lower, so do NOT flip the sign like the hours chart.
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
            // `flex-1 min-w-0`, not `w-8`: 26 columns × 32px = 832px, wider than
            // the 375px frame with no horizontal scroll, so the text breaks.
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
                {/* The min-max band. Earliest is at the TOP, so `top` comes from min. */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded bg-zinc-300 dark:bg-zinc-700"
                  style={{
                    top: `${y(p.stats.min)}%`,
                    height: `${Math.max(2, y(p.stats.max) - y(p.stats.min))}%`,
                  }}
                />
                {/* Median dot */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100"
                  style={{ top: `calc(${y(p.stats.median)}% - 4px)` }}
                />
                {showValue && (
                  // The label sits ABOVE the dot, unless the dot is at the top,
                  // then it flips below - otherwise it spills out and gets cut.
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
