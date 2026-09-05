'use client';

// ---------------------------------------------------------------------------
// logi - Chọn độ dài trend, dùng chung cho cả ba card
//
// Chip chứ không dropdown: chỉ ba lựa chọn, và ba card phải đổi cùng lúc thì
// mới so được với nhau. Bước nhảy gấp đôi (6 → 12 → 26): gần / trung / dài.
// ---------------------------------------------------------------------------
import { TREND_SPANS, type TrendSpan } from '@/lib/trend';

export default function TrendSpanChips({
  value,
  onChange,
}: {
  value: TrendSpan;
  onChange: (s: TrendSpan) => void;
}) {
  return (
    <div role="group" aria-label="Trend period" className="flex gap-2">
      {TREND_SPANS.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={value === s.value}
          onClick={() => onChange(s.value)}
          className={`min-h-9 rounded-sm border px-3 text-[13px] transition active:scale-[0.98] ${
            value === s.value
              ? 'border-line-strong bg-surface-2 font-medium text-ink'
              : 'border-line text-ink-soft'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
