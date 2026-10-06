'use client';

import { useState } from 'react';

import { GroupSheet, ItemSheet } from '@/components/RoutineSheet';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import { useToasts } from '@/hooks/useActivities';
import { useRoutines } from '@/hooks/useRoutine';
import { logicalWeekday } from '@/lib/balance';
import {
  DOW_LETTER,
  DOW_SHORT,
  GRID_DOWS,
  daysLabel,
  itemsForDay,
  moveItem,
  removeItem,
  upsertItem,
} from '@/lib/routine';
import {
  archiveGroup,
  createGroup,
  renameGroup,
  restoreGroup,
  saveItems,
  swapGroups,
} from '@/lib/routine-store';
import type { RoutineGroup, RoutineItem } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - Editing the Routine in the Targets tab (Stage 10)
//
// A template repeating every week, no week navigation: edits here apply from
// now on. Pick a weekday in the chip row to see and add that day's items;
// "All" shows every item with its weekdays.
// ---------------------------------------------------------------------------

type ItemTarget = { group: RoutineGroup; item: RoutineItem | null };

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICON_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted transition active:scale-95 disabled:opacity-30';

export default function RoutineSection() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { groups, loading } = useRoutines();
  const { toasts, push, dismiss } = useToasts();

  /** `null` = show all. Default is today's weekday (logical day, 04:00 cut). */
  const [todayDow] = useState(() => logicalWeekday(Date.now()));
  const [dow, setDow] = useState<number | null>(todayDow);
  const [busy, setBusy] = useState(false);
  const [groupSheet, setGroupSheet] = useState<{ group: RoutineGroup | null } | null>(null);
  const [itemSheet, setItemSheet] = useState<ItemTarget | null>(null);

  async function run(fn: () => Promise<void>, fail: string): Promise<boolean> {
    if (!uid) return false;
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      push(`${fail} ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSaveGroup(title: string) {
    if (!uid) return;
    const g = groupSheet?.group ?? null;
    const ok = await run(
      () => (g ? renameGroup(uid, g.id, title) : createGroup(uid, title, groups).then(() => {})),
      'Could not save group.'
    );
    if (ok) setGroupSheet(null);
  }

  async function onArchiveGroup() {
    const g = groupSheet?.group;
    if (!uid || !g) return;
    const ok = await run(() => archiveGroup(uid, g.id), 'Could not remove group.');
    if (!ok) return;
    setGroupSheet(null);
    push(`Removed “${g.title}”.`, {
      label: 'Undo',
      run: () => {
        void restoreGroup(uid, g.id).catch((e) => push(`Could not undo. ${(e as Error).message}`));
      },
    });
  }

  async function onSaveItem(text: string, days: number[]) {
    if (!uid || !itemSheet) return;
    const { group, item } = itemSheet;
    const next = upsertItem(group.items, { id: item?.id ?? newId(), text, days });
    const ok = await run(() => saveItems(uid, group.id, next), 'Could not save item.');
    if (ok) setItemSheet(null);
  }

  async function onRemoveItem() {
    if (!uid || !itemSheet?.item) return;
    const { group, item } = itemSheet;
    const before = group.items;
    const ok = await run(
      () => saveItems(uid, group.id, removeItem(before, item.id)),
      'Could not remove item.'
    );
    if (!ok) return;
    setItemSheet(null);
    push(`Removed “${item.text}”.`, {
      label: 'Undo',
      run: () => {
        void saveItems(uid, group.id, before).catch((e) =>
          push(`Could not undo. ${(e as Error).message}`)
        );
      },
    });
  }

  function onMoveItem(group: RoutineGroup, id: string, dir: -1 | 1) {
    if (!uid) return;
    const next = moveItem(group.items, id, dir, dow);
    if (next === group.items) return;
    void run(() => saveItems(uid, group.id, next), 'Could not move item.');
  }

  function onMoveGroup(i: number, dir: -1 | 1) {
    const a = groups[i];
    const b = groups[i + dir];
    if (!uid || !a || !b) return;
    void run(() => swapGroups(uid, a, b), 'Could not move group.');
  }

  return (
    <section aria-label="Routine" className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Routine</h2>
        <span className="text-xs text-ink-muted">Repeats every week</span>
      </div>

      {/* Weekday chip row. "All" shows items not on the day being viewed too. */}
      <div className="mb-3 grid grid-cols-8 gap-1" role="tablist" aria-label="Day">
        {[null, ...GRID_DOWS].map((d) => {
          const on = d === dow;
          return (
            <button
              key={d ?? 'all'}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={d === null ? 'All days' : DOW_SHORT[d]}
              onClick={() => setDow(d)}
              className={[
                'min-h-9 rounded-md border text-xs font-medium transition',
                on
                  ? 'border-ink bg-ink text-[var(--surface-0)]'
                  : 'border-line text-ink-soft',
              ].join(' ')}
            >
              {d === null ? 'All' : DOW_LETTER[d]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-center text-sm text-ink-muted">
              No routine yet. Add a group like “Exercise” or “Learn IT”.
            </p>
          ) : null}

          {groups.map((group, gi) => {
            const items = dow === null ? group.items : itemsForDay(group, dow);
            return (
              <div key={group.id} className="rounded-md border border-line bg-surface-1">
                <div className="flex items-center gap-1 border-b border-line py-1 pl-3 pr-1">
                  <button
                    type="button"
                    onClick={() => setGroupSheet({ group })}
                    disabled={busy}
                    className="min-h-9 min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink"
                  >
                    {group.title}
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={busy || gi === 0}
                    onClick={() => onMoveGroup(gi, -1)}
                    aria-label={`Move ${group.title} up`}
                  >
                    <Chevron up />
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    disabled={busy || gi === groups.length - 1}
                    onClick={() => onMoveGroup(gi, 1)}
                    aria-label={`Move ${group.title} down`}
                  >
                    <Chevron up={false} />
                  </button>
                </div>

                <ul>
                  {items.length === 0 ? (
                    <li className="px-3 py-2.5 text-[13px] text-ink-muted">
                      {dow === null ? 'No items yet.' : `Nothing on ${DOW_SHORT[dow]}.`}
                    </li>
                  ) : null}
                  {items.map((item, ii) => (
                    <li key={item.id} className="flex items-center gap-1 border-b border-line pr-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setItemSheet({ group, item })}
                        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-3 text-left"
                      >
                        <span className="truncate text-sm text-ink">{item.text}</span>
                        {dow === null ? (
                          <span className="text-xs text-ink-muted">{daysLabel(item.days)}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN}
                        disabled={busy || ii === 0}
                        onClick={() => onMoveItem(group, item.id, -1)}
                        aria-label={`Move ${item.text} up`}
                      >
                        <Chevron up />
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN}
                        disabled={busy || ii === items.length - 1}
                        onClick={() => onMoveItem(group, item.id, 1)}
                        aria-label={`Move ${item.text} down`}
                      >
                        <Chevron up={false} />
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setItemSheet({ group, item: null })}
                  className="min-h-11 w-full px-3 text-left text-sm text-ink-soft disabled:opacity-40"
                >
                  + Add item
                </button>
              </div>
            );
          })}

          <button
            type="button"
            disabled={busy}
            onClick={() => setGroupSheet({ group: null })}
            className="min-h-11 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
          >
            Add group
          </button>
        </div>
      )}

      {groupSheet ? (
        <GroupSheet
          group={groupSheet.group}
          busy={busy}
          onCancel={() => setGroupSheet(null)}
          onSave={(t) => void onSaveGroup(t)}
          onArchive={() => void onArchiveGroup()}
        />
      ) : null}

      {itemSheet ? (
        <ItemSheet
          item={itemSheet.item}
          groupTitle={itemSheet.group.title}
          defaultDays={[dow ?? todayDow]}
          busy={busy}
          onCancel={() => setItemSheet(null)}
          onSave={(t, d) => void onSaveItem(t, d)}
          onRemove={() => void onRemoveItem()}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
