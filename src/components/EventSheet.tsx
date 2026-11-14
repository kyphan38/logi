'use client';

import { useState } from 'react';

import { countdownText, daysUntil, whenLabel } from '@/lib/events';
import { EVENT_NOTE_MAX, EVENT_TITLE_MAX, type EventItem } from '@/types/logi';

import SheetShell from './SheetShell';
import { btn, LABEL } from '@/lib/ui';

// ---------------------------------------------------------------------------
// logi - Add / edit / delete an event (Stage 9)
//
// The date is required, the time is not. Reminder marks still count in DAYS
// and push still sends at 06:00 - the time here is display only, it does not
// change the send schedule.
// ---------------------------------------------------------------------------

/** Quick date buttons: today + N. The three offsets people type most. */
const QUICK = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In a week', days: 7 },
  { label: 'In a month', days: 30 },
] as const;

/** ts → "YYYY-MM-DD" in local time, exactly what <input type="date"> needs. */
function toDateInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function EventSheet({
  event,
  today,
  now,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  /** null → adding. */
  event: EventItem | null;
  /** Today's logical day - the lower bound of the date field when adding. */
  today: string;
  now: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    title: string;
    date: string;
    time: string | null;
    note: string | null;
  }) => void;
  onArchive: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? today);
  const [time, setTime] = useState(event?.time ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const clean = title.trim();
  const ok = clean.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const days = ok ? daysUntil(date, now) : 0;

  return (
    <SheetShell
      onClose={onCancel}
      label={event ? 'Edit event' : 'New event'}
      center
      className="w-full max-w-lg rounded-t-lg bg-surface-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5"
      header={
        <h3 className="mb-4 text-base font-semibold text-ink">
          {event ? 'Edit event' : 'New event'}
        </h3>
      }
    >

      <label
        htmlFor="event-title"
        className={`${LABEL} mb-1 block`}
      >
        What
      </label>
      <input
        id="event-title"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, EVENT_TITLE_MAX))}
        placeholder="Passport renewal"
        autoFocus
        className="mb-4 w-full rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none focus:border-ink-muted"
      />

      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label
          htmlFor="event-date"
          className={`${LABEL} block`}
        >
          When
        </label>
        {time && (
          <button
            type="button"
            onClick={() => setTime('')}
            className="text-[13px] text-ink-muted hover:text-ink active:text-ink"
          >
            All day
          </button>
        )}
      </div>
      <div className="flex gap-2">
      <input
        id="event-date"
        type="date"
        value={date}
        // A new event cannot pick a past date - a wrong year is the most common
        // typo, and something "300 days ago" can remind nothing.
        // Editing an old event drops the limit, since its date is already past.
        min={event ? undefined : today}
        onChange={(e) => setDate(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none focus:border-ink-muted"
      />
      {/* The time is OPTIONAL - empty means all day. No default value: a time
          the app fills in is a wrong time the user does not notice. */}
      <input
        aria-label="Time (optional)"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-28 shrink-0 rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none focus:border-ink-muted"
      />
      </div>

      <div className="mb-1 mt-2 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.days}
            type="button"
            onClick={() => setDate(toDateInput(Date.now() + q.days * 86_400_000))}
            className="min-h-11 rounded-md border border-line-strong px-3 text-[13px] text-ink-soft active:scale-[0.98]"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Confirm it in words. <input type="date"> on iOS shows a number wheel -
          very easy to pick the wrong month without noticing. */}
      <p className="mb-4 min-h-5 text-[13px] text-ink-muted" aria-live="polite">
        {ok ? `${countdownText(days)} · ${whenLabel(date, time || null)}` : ' '}
      </p>

      <label
        htmlFor="event-note"
        className={`${LABEL} mb-1 block`}
      >
        Note <span className="font-normal normal-case tracking-normal">(optional)</span>
      </label>
      <input
        id="event-note"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, EVENT_NOTE_MAX))}
        placeholder="Bring old passport + 2 photos"
        className="mb-5 w-full rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none focus:border-ink-muted"
      />

      {confirmArchive ? (
        <div className="mb-3 rounded-md border border-line-strong p-3">
          <p className="mb-3 text-[13px] leading-snug text-ink-soft">
            Remove “{event?.title}”? You will stop getting reminders for it.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              className="min-h-11 flex-1 rounded-lg border border-line-strong text-sm"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={onArchive}
              disabled={busy}
              className={`${btn('primary')} flex-1`}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        event && (
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="mb-3 min-h-11 text-sm font-medium text-ink"
          >
            Remove event
          </button>
        )
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`${btn('secondary')} flex-1`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({ title: clean, date, time: time || null, note: note.trim() || null })
          }
          disabled={busy || !ok}
          className={`${btn('primary')} flex-1`}
        >
          Save
        </button>
      </div>
    </SheetShell>
  );
}
