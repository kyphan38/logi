'use client';

// ---------------------------------------------------------------------------
// logi - Balance bars (Stage 5 Task 3)
//
// Chart chính. Trả lời hai câu hỏi trong một hình:
//   "Tôi đã sống bao nhiêu giờ cho mỗi việc?"  → chiều dài thanh
//   "So với dự định thì lệch bao nhiêu?"       → vạch target + số bên phải
//
// Div + CSS thuần, KHÔNG Recharts: ở bề rộng 320px thư viện chart hay nuốt mất
// vạch target hoặc bóp nhãn, mà đây là hai thứ không được sai.
// ---------------------------------------------------------------------------
import { catInk } from '@/lib/category-style';
import type { RangeDeviation } from '@/lib/range-target';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category } from '@/types/logi';

interface Props {
  rows: RangeDeviation[];
  /** Ẩn cột lệch khi khoảng chưa đủ dữ liệu để so sánh. */
  showDeviation?: boolean;
}

export default function BalanceBars({ rows, showDeviation = true }: Props) {
  // MỘT thang đo cho cả 5 thanh. Mỗi thanh một thang thì Fitness 3h sẽ trông
  // dài bằng Sleep 46h - hình đẹp nhưng nói dối.
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.expected)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <Bar key={r.category} row={r} max={max} showDeviation={showDeviation} />
      ))}
    </div>
  );
}

function Bar({
  row,
  max,
  showDeviation,
}: {
  row: RangeDeviation;
  max: number;
  showDeviation: boolean;
}) {
  const pct = (h: number) => `${Math.min(100, (h / max) * 100)}%`;
  const base = Math.min(row.actual, row.expected);
  const over = Math.max(0, row.actual - row.expected);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium" style={{ color: catInk(row.category) }}>
          {CATEGORY_LABEL[row.category]}
        </span>
        <span className="flex items-baseline gap-2 tabular-nums">
          <span className="text-[13px] text-ink">{row.actual.toFixed(1)}h</span>
          {showDeviation && <DeviationTag row={row} />}
        </span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-1">
        {/* Phần trong target */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct(base), background: CATEGORY_COLOR[row.category] }}
        />
        {/* Phần vượt target: kẻ sọc để phân biệt được cả trên thanh Work (vốn
            đã là màu hổ phách) lẫn ở dark mode. */}
        {over > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: pct(base),
              width: pct(over),
              backgroundColor: '#f59e0b',
              backgroundImage:
                'repeating-linear-gradient(45deg, rgb(0 0 0 / 0.22) 0 3px, transparent 3px 7px)',
            }}
          />
        )}
        {/* Vạch target. Nằm trên cùng để không bị thanh che. */}
        {row.expected > 0 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-ink"
            style={{ left: pct(row.expected) }}
            aria-hidden="true"
          />
        )}
      </div>

      <span className="sr-only">
        {CATEGORY_LABEL[row.category]}: {row.actual.toFixed(1)} hours logged, target{' '}
        {row.expected.toFixed(1)} hours
      </span>
    </div>
  );
}

function DeviationTag({ row }: { row: RangeDeviation }) {
  // Deadband kép của balance.ts: dưới ngưỡng thì KHÔNG gắn cờ. Lệch 8% là
  // nhiễu của việc bấm nút muộn vài phút, không phải tín hiệu.
  if (row.flag === 'ok') {
    return <span className="text-[13px] text-ink-muted">·</span>;
  }
  const up = row.flag === 'over';
  return (
    <span className="text-[13px] font-medium text-ink-soft">
      {up ? '↑' : '↓'} {Math.abs(Math.round(row.deltaPct * 100))}%
    </span>
  );
}

export function categoryOrder(): Category[] {
  // Sleep trước: nó là thanh dài nhất, đặt trên cùng thì thang đo đọc dễ hơn.
  return ['sleep', 'work', 'learn', 'fitness', 'leisure'];
}
