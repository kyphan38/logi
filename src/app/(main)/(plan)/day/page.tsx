'use client';

import { useState } from 'react';

import BlockEditor from '@/components/plan/BlockEditor';
import { useAuth } from '@/contexts/AuthContext';
import { useDayPlan } from '@/hooks/useDayPlan';
import { MAX_BLOCKS, PLAN_DAYS, PLAN_DAY_LABEL, blockHours, cleanPlan, type DayPlan, type PlanDay } from '@/lib/day-plan';
import { saveDayPlan } from '@/lib/day-plan-store';
import { btn } from '@/lib/ui';
import { CATEGORIES, CATEGORY_LABEL } from '@/types/logi';

const fmt = (n: number) => `${Math.round(n * 10) / 10}h`;

/** G1: a usual day as time blocks. History compares each day with it. */
export default function DayPlanPage() {
  const { uid } = useAuth();
  const plan = useDayPlan();
  const [day, setDay] = useState<PlanDay>('weekday');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan) return <div className="h-40 breathe rounded-md bg-surface-1" aria-busy="true" aria-label="Loading" />;

  const blocks = plan[day];
  const save = (next: DayPlan) => {
    if (!uid) return;
    setError(null);
    saveDayPlan(uid, cleanPlan(next)).catch((e) => setError(`Could not save. ${(e as Error).message}`));
  };
  const totals = CATEGORIES.map((c) => ({
    c,
    h: blocks.filter((b) => b.category === c).reduce((t, b) => t + blockHours(b), 0),
  })).filter((x) => x.h > 0);

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Day" className="flex gap-2">
        {PLAN_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={day === d}
            onClick={() => {
              setDay(d);
              setAdding(false);
            }}
            className={`min-h-9 rounded-sm border px-3 text-[13px] transition active:scale-[0.98] ${
              day === d ? 'border-line-strong bg-surface-2 font-medium text-ink' : 'border-line text-ink-soft'
            }`}
          >
            {PLAN_DAY_LABEL[d]}
          </button>
        ))}
      </div>

      {blocks.length === 0 && !adding ? <p className="text-sm text-ink-muted">No blocks yet.</p> : null}

      {blocks.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {blocks.map((b, i) => (
            <li key={`${b.start}-${b.category}-${i}`} className="flex items-center gap-3 text-sm tabular-nums">
              <span className="w-28 shrink-0 text-ink-muted">
                {b.start} - {b.end}
              </span>
              <span className="min-w-0 flex-1 text-ink">{CATEGORY_LABEL[b.category]}</span>
              <span className="text-ink-muted">{fmt(blockHours(b))}</span>
              <button
                type="button"
                onClick={() => save({ ...plan, [day]: blocks.filter((_, j) => j !== i) })}
                className="text-[13px] text-ink-soft hover:text-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {totals.length > 0 ? (
        <p className="text-[13px] tabular-nums text-ink-muted">
          {totals.map((x) => `${CATEGORY_LABEL[x.c]} ${fmt(x.h)}`).join(' · ')}
        </p>
      ) : null}

      {adding ? (
        <BlockEditor
          onAdd={(b) => {
            save({ ...plan, [day]: [...blocks, b] });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : blocks.length < MAX_BLOCKS ? (
        <button type="button" onClick={() => setAdding(true)} className={`${btn('secondary', 'sm')} self-start`}>
          + Block
        </button>
      ) : null}

      {error ? <p role="alert" className="text-[13px] text-ink">{error}</p> : null}
    </div>
  );
}
