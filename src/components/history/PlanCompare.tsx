'use client';

import { useMemo } from 'react';

import { useDayPlan } from '@/hooks/useDayPlan';
import { logicalWeekday } from '@/lib/balance';
import { comparePlan, planDayOf } from '@/lib/day-plan';
import { dayWindow } from '@/lib/timeline';
import { CATEGORY_LABEL, type Activity } from '@/types/logi';

const fmt = (n: number) => `${Math.round(n * 10) / 10}h`;

/**
 * G1: the day plan next to the real day. The timeline is elastic (gaps fold),
 * so the plan is a faint list above it instead of blocks drawn to scale.
 */
export default function PlanCompare({ date, activities, now }: { date: string; activities: Activity[]; now: number }) {
  const plan = useDayPlan();
  const blocks = useMemo(() => (plan ? plan[planDayOf(logicalWeekday(dayWindow(date).start))] : []), [plan, date]);
  const cmp = useMemo(() => comparePlan(blocks, activities, date, now), [blocks, activities, date, now]);

  // Nothing planned for this day, or the day has not started.
  if (blocks.length === 0 || dayWindow(date).start > now) return null;

  return (
    <section aria-label="Plan" className="mb-4 flex flex-col gap-1 text-[13px] tabular-nums">
      {cmp.lines.map((l) => (
        <p key={l} className="text-ink-soft">
          {l}
        </p>
      ))}
      {cmp.biggest ? (
        <p className="text-ink-muted">
          Biggest gap: {CATEGORY_LABEL[cmp.biggest.block.category]} {cmp.biggest.block.start}-{cmp.biggest.block.end}, did{' '}
          {fmt(cmp.biggest.did)} of {fmt(cmp.biggest.planned)}
        </p>
      ) : null}
      <ul className="mt-1 flex flex-col gap-1 border-l border-line-strong pl-3 text-ink-muted">
        {cmp.blocks.map((r, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-24 shrink-0">
              {r.block.start}-{r.block.end}
            </span>
            <span className="min-w-0 flex-1">{CATEGORY_LABEL[r.block.category]}</span>
            <span>
              {fmt(r.did)} / {fmt(r.planned)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
