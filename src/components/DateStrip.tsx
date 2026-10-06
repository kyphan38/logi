'use client';

// ---------------------------------------------------------------------------
// logi - Day picker on the History screen
//
// The old version was a SIDE-SCROLLING strip of 7 days (today at the end).
// Two problems:
//   1. 7 cells + a calendar button were wider than 375px → the page swayed sideways
//   2. "Last 7 days" spans two weeks, so week boundaries were invisible
//
// This one is a FIXED 7-column grid: the exact week (Mon → Sun) holding the
// selected day. No `overflow-x` anywhere → no side scroll. Weeks change with
// two arrow buttons, not swipes (swipes caused the bug).
// ---------------------------------------------------------------------------
import { addDays } from '@/lib/timeline';
import { CATEGORY_COLOR, type Category } from '@/types/logi';

/** One segment of the mini bar: category + share of that day's logged hours. */
export interface DayBar {
  c: Category;
  pct: number;
}

/** First letter of each weekday, starting Monday. */
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week holding `date`. getDay(): 0 = Sun, so Sunday steps back 6 days. */
function mondayOf(date: string): string {
  const shift = (toDate(date).getDay() + 6) % 7;
  return addDays(date, -shift);
}

/** "Aug 24 – 30", across months "Aug 31 – Sep 6". */
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
  /** Today's logical day. Days after it cannot be tapped. */
  today: string;
  selected: string;
  /** date → category shares. Missing key = nothing logged that day. */
  bars: Record<string, DayBar[]>;
  onSelect: (date: string) => void;
}) {
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6];

  // This week is the last one - nothing ahead to see.
  const atCurrentWeek = monday >= mondayOf(today);

  // Going back lands on Monday. Going forward past today stops at today, so a
  // day that has not happened is never selected.
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

      {/* 7 equal columns - never wider than the screen. */}
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
              {/* One glance shows which days Work swallowed. */}
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
