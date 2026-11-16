'use client';

// ============================================================
// logi - Confirm card for several activities said at once.
// Lists what was understood; complete entries start ticked. Entries missing
// a field cannot be saved from here (fill them in by hand afterwards).
// ============================================================

import { useState } from 'react';

import { describeEntry, type BatchItem } from '@/lib/voice-batch';

export default function VoiceBatchCard({
  items,
  now,
  busy,
  onSave,
  onCancel,
}: {
  items: BatchItem[];
  now: number;
  busy: boolean;
  onSave: (indexes: number[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<boolean[]>(() => items.map((i) => i.ready));
  const chosen = picked.flatMap((on, i) => (on && items[i].ready ? [i] : []));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-medium">Log these?</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i}>
            <label className={`flex items-center gap-3 text-[15px] ${item.ready ? '' : 'text-faint'}`}>
              <input
                type="checkbox"
                checked={picked[i] && item.ready}
                disabled={!item.ready || busy}
                onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                className="size-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                {describeEntry(item.cmd, now)}
                {!item.ready && <span className="block text-[13px]">Needs a time. Add it by hand.</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy || chosen.length === 0}
          onClick={() => onSave(chosen)}
          className="min-h-11 flex-1 rounded-md bg-ink px-4 text-base font-medium text-bg disabled:opacity-40"
        >
          {busy ? 'Saving…' : chosen.length === items.length ? 'Save all' : `Save ${chosen.length}`}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 px-4 text-base text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
