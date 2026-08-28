'use client';

// ---------------------------------------------------------------------------
// logi - Chọn ngày trên màn History
//
// Bản cũ là dải 7 ngày CUỘN NGANG (hôm nay ở cuối). Hai vấn đề:
//   1. 7 ô + nút lịch rộng hơn màn 375px → trang bị kéo ngang, đung đưa
//   2. "7 ngày gần nhất" vắt qua hai tuần, nên không nhìn ra ranh giới tuần
//
// Bản này là lưới CỐ ĐỊNH 7 cột: đúng tuần (2 → CN) chứa ngày đang chọn.
// Không có `overflow-x` ở đâu cả → hết cuộn ngang. Đổi tuần bằng hai nút mũi
// tên, không bằng vuốt (vuốt là thứ đã gây ra lỗi).
// ---------------------------------------------------------------------------
import { addDays } from '@/lib/timeline';
import { CATEGORY_COLOR, type Category } from '@/types/logi';

/** Một đoạn của thanh mini: category + phần trăm giờ đã log của ngày đó. */
export interface DayBar {
  c: Category;
  pct: number;
}

/** Chữ cái đầu của thứ, bắt đầu từ thứ Hai. */
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Thứ Hai của tuần chứa `date`. getDay(): 0 = CN, nên CN lùi 6 ngày. */
function mondayOf(date: string): string {
  const shift = (toDate(date).getDay() + 6) % 7;
  return addDays(date, -shift);
}

/** "Aug 24 – 30", vắt tháng thì "Aug 31 – Sep 6". */
function weekLabel(monday: string, sunday: string): string {
  const a = toDate(monday);
  const b = toDate(sunday);
  const mon = (d: Date) => d.toLocaleDateString([], { month: 'short' });
  const left = `${mon(a)} ${a.getDate()}`;
  const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${mon(b)} ${b.getDate()}`;
  return `${left} – ${right}`;
}

export default function DateStrip({
  today,
  selected,
  bars,
  onSelect,
}: {
  /** Ngày logic hôm nay. Ngày sau mốc này không bấm được. */
  today: string;
  selected: string;
  /** date → tỉ lệ category. Thiếu key = ngày chưa log gì. */
  bars: Record<string, DayBar[]>;
  onSelect: (date: string) => void;
}) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6];

  // Tuần này là tuần cuối cùng - không có gì để xem ở phía trước.
  const atCurrentWeek = monday >= mondayOf(today);

  // Lùi tuần thì đứng ở thứ Hai. Tiến tuần mà vượt hôm nay thì dừng ở hôm nay,
  // để không bao giờ chọn phải một ngày chưa xảy ra.
  const goWeek = (n: number) => {
    const next = addDays(monday, n * 7);
    onSelect(next > today ? today : next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <Arrow dir="prev" onClick={() => goWeek(-1)} />
        <p className="flex-1 truncate text-center text-[13px] tabular-nums text-ink-soft">
          {weekLabel(monday, sunday)}
        </p>
        <Arrow dir="next" disabled={atCurrentWeek} onClick={() => goWeek(1)} />

        <label className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted">
          <span className="sr-only">Pick a date</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
          <input
            type="date"
            value={selected}
            max={today}
            onChange={(e) => e.target.value && onSelect(e.target.value)}
            className="absolute inset-0 h-full w-full opacity-0"
          />
        </label>
      </div>

      {/* 7 cột chia đều bề rộng - không bao giờ tràn ra ngoài màn hình. */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const active = d === selected;
          const future = d > today;
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => onSelect(d)}
              aria-current={active ? 'date' : undefined}
              className={[
                'flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-md text-xs transition',
                active
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : future
                    ? 'text-ink-muted opacity-40'
                    : 'text-ink-soft active:scale-[0.97]',
              ].join(' ')}
            >
              <span className={active ? '' : 'text-ink-muted'}>{DOW[i]}</span>
              <span className="text-sm font-semibold tabular-nums">{toDate(d).getDate()}</span>
              {/* Nhìn một cái là thấy ngày nào bị Work nuốt hết. */}
              <span
                aria-hidden="true"
                className="flex w-6 overflow-hidden rounded-full"
                style={{ height: active ? 5 : 4 }}
              >
                {(bars[d] ?? []).length > 0 ? (
                  bars[d].map((b) => (
                    <span
                      key={b.c}
                      style={{ width: `${b.pct}%`, backgroundColor: CATEGORY_COLOR[b.c] }}
                    />
                  ))
                ) : (
                  <span className={future ? 'w-full' : 'w-full bg-zinc-200 dark:bg-zinc-700'} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Arrow({
  dir,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous week' : 'Next week'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-soft transition active:scale-[0.95] disabled:opacity-25"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
