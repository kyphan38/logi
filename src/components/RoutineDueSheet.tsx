'use client';

import { useState } from 'react';

import { minutesLabel } from '@/lib/routine';
import type { Activity } from '@/types/logi';

import SheetShell from './SheetShell';
import { btn } from '@/lib/ui';

// ---------------------------------------------------------------------------
// logi - "Done?" when a routine session reaches its planned length
//
// Yes stops the session and ticks the item. Not yet asks how much more time,
// then the same session keeps running with a new due time.
// ---------------------------------------------------------------------------

const MORE_MINUTES: readonly number[] = [10, 25, 50];

const BTN = `${btn('secondary')} flex-1`;
const BTN_MAIN = `${btn('primary')} flex-1`;

export default function RoutineDueSheet({
  activity,
  busy,
  onDone,
  onMore,
}: {
  activity: Activity;
  busy: boolean;
  onDone: () => void;
  onMore: (minutes: number) => void;
}) {
  const [asking, setAsking] = useState(false);
  const title = `Done with ${activity.label ?? 'this'}?`;

  return (
    // No onClose: the session must be finished or given more time.
    <SheetShell
      label={title}
      center
      className="w-full max-w-lg rounded-t-lg bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5"
    >
      <h3 className="mb-4 text-base font-semibold text-ink">
        {asking ? 'How much more time?' : title}
      </h3>
      {asking ? (
        <div className="flex gap-2">
          {MORE_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMore(m)}
              disabled={busy}
              className={BTN}
            >
              +{minutesLabel(m)}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setAsking(true)} disabled={busy} className={BTN}>
            Not yet
          </button>
          <button type="button" onClick={onDone} disabled={busy} className={BTN_MAIN}>
            Yes, done
          </button>
        </div>
      )}
    </SheetShell>
  );
}
