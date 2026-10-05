'use client';

import { useState } from 'react';

import { DOW_LETTER, DOW_SHORT, GRID_DOWS } from '@/lib/routine';
import {
  ROUTINE_ITEM_MAX,
  ROUTINE_TITLE_MAX,
  type RoutineGroup,
  type RoutineItem,
} from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Sheet thêm / sửa nhóm và mục của Routine (Stage 10)
// ---------------------------------------------------------------------------

const INPUT =
  'mb-4 w-full rounded-md border border-line-strong bg-transparent px-3 py-2.5 text-base text-ink outline-none focus:border-ink';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted';
const BTN = 'min-h-11 flex-1 rounded-lg border border-line-strong text-sm font-medium text-ink-soft';
const BTN_MAIN = 'min-h-11 flex-1 rounded-lg bg-ink text-sm font-medium text-[var(--surface-0)] disabled:opacity-40';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="w-full max-w-lg rounded-t-lg bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5">
        <h3 className="mb-4 text-base font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Xoá có một bước xác nhận ngay trong sheet, không mở thêm hộp thoại. */
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
  /** null → thêm mới. */
  group: RoutineGroup | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (title: string) => void;
  onArchive: () => void;
}) {
  const [title, setTitle] = useState(group?.title ?? '');
  const clean = title.trim();

  return (
    <Shell title={group ? 'Edit group' : 'New group'}>
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
  /** null → thêm mới. */
  item: RoutineItem | null;
  groupTitle: string;
  /** Mục mới bật sẵn ngày đang xem - trường hợp hay gặp nhất. */
  defaultDays: number[];
  busy: boolean;
  onCancel: () => void;
  onSave: (text: string, days: number[]) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(item?.text ?? '');
  const [days, setDays] = useState<number[]>(item?.days ?? defaultDays);
  const clean = text.trim();
  const ok = clean.length > 0 && days.length > 0;

  function flip(d: number) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <Shell title={item ? `Edit item · ${groupTitle}` : `New item · ${groupTitle}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onSave(clean, days);
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
            className="text-xs text-ink-soft underline-offset-2 hover:underline"
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
