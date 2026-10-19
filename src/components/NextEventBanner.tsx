'use client';

import Link from 'next/link';

import { useEvents } from '@/hooks/useEvents';
import { countdownText, daysUntil } from '@/lib/events';

// Only the coming week: further dates are not worth a line on Now.
const HORIZON_DAYS = 7;

/** The nearest typed-in date, as one line on Now. Tapping opens Plan > Dates. */
export default function NextEventBanner() {
  const { upcoming, now } = useEvents();
  const next = upcoming[0];
  if (!next) return null;
  const days = daysUntil(next.date, now);
  if (days > HORIZON_DAYS) return null;

  return (
    <Link
      href="/reminders"
      className={[
        'flex items-center justify-between gap-3 border-l-2 py-1 pl-3 text-sm text-ink transition active:scale-[0.99]',
        days <= 1 ? 'border-ink font-medium' : 'border-line-strong',
      ].join(' ')}
    >
      <span className="min-w-0 truncate">
        {next.title}
        <span className="text-ink-muted"> · {countdownText(days)}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 opacity-60">
        ›
      </span>
    </Link>
  );
}
