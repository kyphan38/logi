'use client';

// ---------------------------------------------------------------------------
// logi — Coverage & overlap (Stage 5 Task 6)
//
// Đặt TRƯỚC các chart, không phải sau. Nếu chỉ log 40% thời gian thì "Learn
// thiếu 12h" là câu vô nghĩa: có thể đã học nhưng quên bấm. Người đọc cần biết
// điều đó trước khi tin bất kỳ con số nào bên dưới.
// ---------------------------------------------------------------------------

const FLOOR = 0.55;

interface Props {
  /** 0..1 */
  coverage: number;
  /** Số giờ bị đếm hai lần. */
  overlap: number;
}

export default function CoverageNote({ coverage, overlap }: Props) {
  const pct = Math.round(coverage * 100);
  const low = coverage < FLOOR;

  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-md border p-3',
        low ? 'border-line-strong bg-surface-1' : 'border-line bg-surface-1',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] tabular-nums text-ink">Coverage {pct}%</span>
        {overlap > 0.05 && (
          <span
            className="text-[13px] tabular-nums text-ink-muted"
            title="Time counted in two categories at once (e.g. Work while Learning)."
          >
            Overlap {overlap.toFixed(1)}h
          </span>
        )}
      </div>

      {low && (
        <p className="text-[13px] text-ink-soft">
          Only {pct}% of this period is logged. The numbers below may not reflect reality.
        </p>
      )}
    </div>
  );
}
