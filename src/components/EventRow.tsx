'use client';

import { countdownParts, daysUntil, urgency, whenLabel, type Urgency } from '@/lib/events';
import { MILESTONES, type EventItem } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - One row in the event list (Stage 9)
//
// The biggest thing on the row is the COUNTDOWN, not the name. People open
// this tab to know "how long left"; the name only identifies which one.
//
// The first version put the countdown as a 13px gray line UNDER the name - the
// most important thing was the faintest on screen. Now it is a number block on
// the left, and the date gets full text color back.
// ---------------------------------------------------------------------------

/** Row border + number block fill and text. One urgency level, one set of three. */
const TONE: Record<Urgency, { row: string; chip: string; num: string }> = {
  // Gray only (DESIGN.md): more urgent = stronger. Today is an inverted number
  // block (ink fill), then an ink border, then a faint border. The words
  // "Today" / the day count say the rest.
  today: {
    row: 'border-ink',
    chip: 'bg-ink',
    num: 'text-surface-0',
  },
  soon: {
    row: 'border-ink',
    chip: 'bg-surface-1',
    num: 'text-ink',
  },
  near: {
    row: 'border-ink-muted',
    chip: 'bg-surface-1',
    num: 'text-ink',
  },
  far: {
    row: 'border-line-strong',
    // Far away = a light border - weight is what says "urgent". Big and bold enough to read.
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
  // "Today" is a whole word, not a number - shrink it to fit the block.
  const wide = value.length > 2;

  // The remaining marks ahead. Show the user that the app WILL remind them, so
  // they do not need to remember it elsewhere too.
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
        {/* The date uses FULL text color. It used to be ink-muted, but it is the
            info people come here to read - not a footnote. */}
        <span className="text-[13px] font-medium tabular-nums text-ink-soft">
          {whenLabel(event.date, event.time)}
        </span>
        {event.note && (
          <span className="truncate text-[12px] leading-snug text-ink-muted">{event.note}</span>
        )}
      </span>

      {ahead > 0 && (
        <span
          className="flex shrink-0 select-none items-center gap-1 self-start text-[11px] tabular-nums text-ink-muted"
          title={`${ahead} reminder${ahead === 1 ? '' : 's'} still to come`}
        >
          {/* A one-stroke SVG, NOT an emoji. Browsers draw 🔔 with their own
              palette - bright yellow, ignores text color, wrong tone in dark
              mode. This shape matches the bottom tab icon exactly. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
            className="h-3 w-3"
          >
            <path d="M6 16.5h12L16.5 14V10a4.5 4.5 0 0 0-9 0v4z" strokeLinejoin="round" />
            <path d="M10 19.5h4" strokeLinecap="round" />
          </svg>
          {ahead}
        </span>
      )}
    </button>
  );
}
