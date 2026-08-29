'use client';

// ---------------------------------------------------------------------------
// logi - Bảng DONE / TARGET / LEFT|DIFF của Analytics (AMENDMENT mục 8.2)
//
// Thay `TodayCard`: bảng cũ luôn kể chuyện hôm nay dù chọn range nào.
// Toàn bộ số học nằm ở `@/lib/range-table`; đây chỉ là phần vẽ.
// ---------------------------------------------------------------------------
import { type Range } from '@/lib/range';
import { rangeTable } from '@/lib/range-table';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** DIFF luôn có dấu, kể cả `+0.0` - không dấu thì đọc như con số tuyệt đối. */
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${h(Math.abs(n))}`;

export default function RangeTable({
  activities,
  range,
  weekTargets,
  now,
}: {
  activities: Activity[];
  range: Range;
  weekTargets: Map<string, Record<Category, number>>;
  now: number;
}) {
  const t = rangeTable(activities, range, weekTargets, now);

  if (t.rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-medium text-ink-soft">{t.title}</h2>

      <div className="flex flex-col rounded-md border border-line-strong bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-2 pb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
          <span className="flex-1" />
          <span className="w-12 text-right">Done</span>
          <span className="w-12 text-right">Target</span>
          <span className="w-14 text-right">{t.tailLabel}</span>
        </div>

        {t.rows.map((r) => (
          <div
            key={r.category}
            className="flex items-center gap-2 border-t border-line py-1.5 text-[13px] tabular-nums"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[r.category] }}
              />
              <span className="truncate text-ink">{CATEGORY_LABEL[r.category]}</span>
            </span>

            <span className="w-12 text-right text-ink">{h(r.done)}</span>
            <span className="w-12 text-right text-ink-muted">
              {r.target > 0 ? h(r.target) : '-'}
            </span>
            <span className="w-14 text-right text-ink-soft">
              {t.tail === 'diff'
                ? signed(r.tail)
                : r.target <= 0
                  ? '-'
                  : r.tail > 0.05
                    ? h(r.tail)
                    : 'done'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-ink-muted">{t.note}</p>
    </section>
  );
}
