'use client';

import { countdownParts, daysUntil, urgency, whenLabel, type Urgency } from '@/lib/events';
import { MILESTONES, type EventItem } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Một dòng trong danh sách sự kiện (Stage 9)
//
// Thứ to nhất trên dòng là ĐẾM NGƯỢC, không phải tên việc. Người ta mở tab này
// để biết "còn bao lâu"; tên việc chỉ để nhận ra là việc nào.
//
// Bản đầu để đếm ngược thành một dòng chữ 13px màu xám nằm DƯỚI tên việc - thứ
// quan trọng nhất lại là thứ mờ nhất trên màn hình. Nay nó là một khối số bên
// trái, và ngày tháng lấy lại màu chữ đầy đủ.
// ---------------------------------------------------------------------------

/** Viền của cả dòng + nền và chữ của khối số. Một mức gấp, một bộ ba. */
const TONE: Record<Urgency, { row: string; chip: string; num: string }> = {
  today: {
    row: 'border-red-400 dark:border-red-800',
    chip: 'bg-red-50 dark:bg-red-950/50',
    num: 'text-red-600 dark:text-red-400',
  },
  soon: {
    row: 'border-amber-400 dark:border-amber-800',
    chip: 'bg-amber-50 dark:bg-amber-950/50',
    num: 'text-amber-700 dark:text-amber-400',
  },
  near: {
    row: 'border-amber-300 dark:border-amber-900',
    chip: 'bg-amber-50 dark:bg-amber-950/40',
    num: 'text-amber-700 dark:text-amber-400',
  },
  far: {
    row: 'border-line-strong',
    // Xa thì KHÔNG tô màu - màu là để nói "gấp". Đủ to và đủ đậm là đọc được.
    chip: 'bg-surface-1',
    num: 'text-ink',
  },
  past: {
    row: 'border-line-strong',
    chip: 'bg-surface-1',
    num: 'text-ink-muted',
  },
};

export default function EventRow({
  event,
  now,
  onEdit,
}: {
  event: EventItem;
  now: number;
  onEdit: () => void;
}) {
  const days = daysUntil(event.date, now);
  const tone = urgency(days);
  const c = TONE[tone];
  const { value, unit } = countdownParts(days);
  // "Today" là cả một câu, không phải con số - thu nhỏ lại cho vừa khối.
  const wide = value.length > 2;

  // Mốc còn lại ở phía trước. Cho người dùng thấy app SẼ nhắc, nên họ không
  // phải tự nhớ thêm ở chỗ khác nữa.
  const ahead = MILESTONES.filter((m) => m < days).length;

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`flex w-full items-stretch gap-3 rounded-md border bg-surface-2 p-3 text-left active:scale-[0.995] ${c.row} ${
        tone === 'past' ? 'opacity-70' : ''
      }`}
    >
      <span
        className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-md px-1 py-1.5 ${c.chip}`}
      >
        <span
          className={`font-semibold leading-none tabular-nums ${c.num} ${
            wide ? 'text-sm' : 'text-2xl'
          }`}
        >
          {value}
        </span>
        {unit && (
          <span className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${c.num}`}>
            {unit}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span
          className={`truncate text-[15px] font-semibold ${
            tone === 'past' ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          {event.title}
        </span>
        {/* Ngày tháng dùng màu chữ ĐẦY ĐỦ. Trước đây nó là ink-muted, mà đó là
            thông tin người dùng tới đây để đọc - không phải chú thích. */}
        <span className="text-[13px] font-medium tabular-nums text-ink-soft">
          {whenLabel(event.date, event.time)}
        </span>
        {event.note && (
          <span className="truncate text-[12px] leading-snug text-ink-muted">{event.note}</span>
        )}
      </span>

      {ahead > 0 && (
        <span
          className="shrink-0 self-start text-[11px] tabular-nums text-ink-muted"
          title={`${ahead} reminder${ahead === 1 ? '' : 's'} still to come`}
        >
          🔔 {ahead}
        </span>
      )}
    </button>
  );
}
