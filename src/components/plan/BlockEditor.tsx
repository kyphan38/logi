'use client';

import { useState } from 'react';

import { cleanBlock, type PlanBlock } from '@/lib/day-plan';
import { btn } from '@/lib/ui';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/types/logi';

const FIELD = 'rounded-sm border border-line bg-surface-2 px-2 py-1 text-sm tabular-nums text-ink';

/** One new block: start, end, category. */
export default function BlockEditor({ onAdd, onCancel }: { onAdd: (b: PlanBlock) => void; onCancel: () => void }) {
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('21:00');
  const [category, setCategory] = useState<Category>('learn');
  const block = cleanBlock({ start, end, category });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-1 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" className={FIELD} />
        <span aria-hidden="true">-</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End" className={FIELD} />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Category" className={FIELD}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!block} onClick={() => block && onAdd(block)} className={btn('primary', 'sm')}>
          Add
        </button>
        <button type="button" onClick={onCancel} className={btn('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
