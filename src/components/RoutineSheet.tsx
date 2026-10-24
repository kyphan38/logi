'use client';

import { useState } from 'react';

import {
  DOW_LETTER,
  DOW_SHORT,
  GRID_DOWS,
  MINUTE_PRESETS,
  ROUTINE_MINUTES_MAX,
  cleanMinutes,
  minutesLabel,
} from '@/lib/routine';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  ROUTINE_ITEM_MAX,
  ROUTINE_TITLE_MAX,
  type Category,
  type RoutineGroup,
  type RoutineItem,
} from '@/types/logi';

import SheetShell from './SheetShell';

// ---------------------------------------------------------------------------
// logi - Sheet for adding / editing Routine groups and items (Stage 10)
// ---------------------------------------------------------------------------

const INPUT =
  'mb-4 w-full rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-base text-ink outline-none focus:border-ink';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted';
const BTN = 'min-h-11 flex-1 rounded-lg border border-line-strong text-sm font-medium text-ink-soft';
const BTN_MAIN = 'min-h-11 flex-1 rounded-lg bg-ink text-sm font-medium text-[var(--surface-0)] disabled:opacity-40';

function chip(on: boolean): string {
  return [
    'min-h-11 rounded-md border px-1 text-sm font-medium transition',
    on ? 'border-ink bg-ink text-[var(--surface-0)]' : 'border-line-strong text-ink-soft',
  ].join(' ');
}

export interface ItemDraft {
  text: string;
  days: number[];
  minutes: number | null;
  category: Category | null;
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <SheetShell
      onClose={onClose}
      label={title}
      center
      className="w-full max-w-lg rounded-t-lg bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5"
      header={<h3 className="mb-4 text-base font-semibold text-ink">{title}</h3>}
    >
      {children}
    </SheetShell>
  );
}

/** Delete has one confirm step inside the sheet, no extra dialog. */
function RemoveRow({
  label,
  question,
  busy,
  onRemove,
}: {
  label: string;
  question: string;
  busy: boolean;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="mb-3 min-h-11 text-sm font-medium text-zinc-900 dark:text-zinc-100"
      >
        {label}
      </button>
    );
  }
  return (
    <div className="mb-3 rounded-md border border-zinc-300 p-3 dark:border-zinc-700">
      <p className="mb-3 text-[13px] leading-snug text-ink-soft">{question}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirm(false)} className={BTN}>
          Keep
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="min-h-11 flex-1 rounded-lg bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export function GroupSheet({
  group,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  /** null → adding. */
  group: RoutineGroup | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (title: string) => void;
  onArchive: () => void;
}) {
  const [title, setTitle] = useState(group?.title ?? '');
  const clean = title.trim();

  return (
    <Shell title={group ? 'Edit group' : 'New group'} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (clean && !busy) onSave(clean);
        }}
      >
        <label className={LABEL} htmlFor="routine-group-title">
          Name
        </label>
        <input
          id="routine-group-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, ROUTINE_TITLE_MAX))}
          placeholder="Exercise"
          autoFocus
          className={INPUT}
        />

        {group ? (
          <RemoveRow
            label="Remove group"
            question={`Remove “${group.title}” and all its items?`}
            busy={busy}
            onRemove={onArchive}
          />
        ) : null}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className={BTN}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !clean} className={BTN_MAIN}>
            Save
          </button>
        </div>
      </form>
    </Shell>
  );
}

export function ItemSheet({
  item,
  groupTitle,
  defaultDays,
  busy,
  onCancel,
  onSave,
  onRemove,
}: {
  /** null → adding. */
  item: RoutineItem | null;
  groupTitle: string;
  /** A new item starts on the viewed day - the most common case. */
  defaultDays: number[];
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: ItemDraft) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(item?.text ?? '');
  const [days, setDays] = useState<number[]>(item?.days ?? defaultDays);
  const [category, setCategory] = useState<Category | null>(item?.category ?? null);
  const startMinutes = item?.minutes ?? null;
  const [minutes, setMinutes] = useState<number | null>(startMinutes);
  // A saved length that is not a preset opens in Custom.
  const [custom, setCustom] = useState(
    startMinutes !== null && !MINUTE_PRESETS.includes(startMinutes)
  );
  const [customText, setCustomText] = useState(custom ? String(startMinutes) : '');
  const clean = text.trim();
  const ok = clean.length > 0 && days.length > 0 && (!custom || minutes !== null);

  function flip(d: number) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <Shell
      title={item ? `Edit item · ${groupTitle}` : `New item · ${groupTitle}`}
      onClose={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onSave({ text: clean, days, minutes, category });
        }}
      >
        <label className={LABEL} htmlFor="routine-item-text">
          Item
        </label>
        <input
          id="routine-item-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, ROUTINE_ITEM_MAX))}
          placeholder="Push-up 3x20"
          autoFocus
          className={INPUT}
        />

        <div className="mb-1 flex items-baseline justify-between">
          <p className={LABEL}>Days</p>
          <button
            type="button"
            onClick={() => setDays(days.length === 7 ? [] : [...GRID_DOWS])}
            className="text-xs text-ink-soft hover:text-ink active:text-ink"
          >
            {days.length === 7 ? 'Clear' : 'Every day'}
          </button>
        </div>
        <div className="mb-5 grid grid-cols-7 gap-1.5">
          {GRID_DOWS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={DOW_SHORT[d]}
                onClick={() => flip(d)}
                className={[
                  'min-h-11 rounded-md border text-sm font-medium transition',
                  on
                    ? 'border-ink bg-ink text-[var(--surface-0)]'
                    : 'border-line-strong text-ink-soft',
                ].join(' ')}
              >
                {DOW_LETTER[d]}
              </button>
            );
          })}
        </div>

        <p className={LABEL}>Time</p>
        <div className="mb-2 grid grid-cols-6 gap-1.5">
          <button
            type="button"
            aria-pressed={minutes === null && !custom}
            onClick={() => {
              setCustom(false);
              setMinutes(null);
            }}
            className={chip(minutes === null && !custom)}
          >
            None
          </button>
          {MINUTE_PRESETS.map((m) => {
            const on = !custom && minutes === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCustom(false);
                  setMinutes(m);
                }}
                className={chip(on)}
              >
                {minutesLabel(m)}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={custom}
            onClick={() => {
              setCustom(true);
              setMinutes(cleanMinutes(Number(customText)));
            }}
            className={chip(custom)}
          >
            Custom
          </button>
        </div>
        {custom ? (
          <div className="mb-2 flex items-center gap-2">
            <input
              aria-label="Minutes"
              inputMode="numeric"
              value={customText}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                setCustomText(v);
                setMinutes(cleanMinutes(Number(v)));
              }}
              placeholder="40"
              autoFocus
              className="w-24 rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-base text-ink outline-none focus:border-ink"
            />
            <span className="text-sm text-ink-muted">
              min{minutes !== null && minutes >= 60 ? ` · ${minutesLabel(minutes)}` : ''}
              {customText && minutes === null ? ` · 1 to ${ROUTINE_MINUTES_MAX}` : ''}
            </span>
          </div>
        ) : null}

        <p className={`${LABEL} mt-4`}>Start as</p>
        <div className="mb-5 grid grid-cols-5 gap-1.5">
          {[null, ...CATEGORIES].map((c) => {
            const on = category === c;
            return (
              <button
                key={c ?? 'none'}
                type="button"
                aria-pressed={on}
                onClick={() => setCategory(c)}
                className={chip(on)}
              >
                {c === null ? 'None' : CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>

        {item ? (
          <RemoveRow
            label="Remove item"
            question={`Remove “${item.text}” from every day?`}
            busy={busy}
            onRemove={onRemove}
          />
        ) : null}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className={BTN}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !ok} className={BTN_MAIN}>
            Save
          </button>
        </div>
      </form>
    </Shell>
  );
}
