'use client';

// ---------------------------------------------------------------------------
// logi - Card "Today" trên màn Analytics
//
// Chart trả lời cả khoảng đang chọn. Card này trả lời đúng một câu, cho HÔM
// NAY: mỗi nhóm định làm mấy tiếng, đã làm mấy tiếng, còn thiếu mấy tiếng.
//
// Cố ý KHÔNG có carry-over: thiếu hôm nay không tự cộng sang mai. Bù trừ là
// chuyện của `debt` theo tuần (rollover.ts), không phải của card này.
//
// Con số phải khớp từng chữ số với màn History: cùng `actualHours()`, cùng
// `daySummary()`, cùng cách lọc theo `logicalDate(startAt)`.
// ---------------------------------------------------------------------------
import { actualHours, logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import { daySummary } from '@/lib/day-target';
import { type Range } from '@/lib/range';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export default function TodayCard({
  activities,
  range,
  weekTargets,
  now,
}: {
  /** Activity của cả range đang xem; component tự lọc lấy hôm nay. */
  activities: Activity[];
  range: Range;
  weekTargets: Map<string, Record<Category, number>>;
  now: number;
}) {
  const today = logicalDate(now);

  // Range không chứa hôm nay (VD đang xem tuần trước) thì card này vô nghĩa.
  if (today < range.from || today > range.to) return null;

  const mine = activities.filter((a) => logicalDate(a.startAt) === today);
  const weekly = weekTargets.get(logicalWeek(now)) ?? null;
  // Target CẢ NGÀY, không pro-rate theo đồng hồ - giống History.
  const lines = daySummary(actualHours(mine, now), weekly, logicalWeekday(now));

  if (lines.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-medium text-ink-soft">Today</h2>

      <div className="flex flex-col rounded-md border border-line-strong bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-2 pb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
          <span className="flex-1" />
          <span className="w-12 text-right">Done</span>
          <span className="w-12 text-right">Target</span>
          <span className="w-14 text-right">Left</span>
        </div>

        {lines.map((l) => {
          const left = l.target - l.actual;
          return (
            <div
              key={l.category}
              className="flex items-center gap-2 border-t border-line py-1.5 text-[13px] tabular-nums"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[l.category] }}
                />
                <span className="truncate text-ink">{CATEGORY_LABEL[l.category]}</span>
              </span>

              <span className="w-12 text-right text-ink">{h(l.actual)}</span>
              <span className="w-12 text-right text-ink-muted">
                {l.target > 0 ? h(l.target) : '-'}
              </span>
              <span className="w-14 text-right text-ink-soft">
                {l.target <= 0 ? '-' : left > 0.05 ? h(left) : 'done'}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-muted">
        Hours left today. Nothing carries over to tomorrow.
      </p>
    </section>
  );
}
