'use client';

// ---------------------------------------------------------------------------
// logi - Tỉ lệ hoàn thành theo từng task (tab Trend)
//
// Không có chart theo cột nên không cắt bucket: card này gộp cả cửa sổ lại,
// task nào luôn bị bỏ sẽ lộ ra ở đây.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';

import Card from '@/components/Card';
import { weeksOf } from '@/lib/range';
import { completionRate, expandPlan, tallyTasks } from '@/lib/tasks';
import { trendWindow, type TrendBucket } from '@/lib/trend';
import type { WeekPlan } from '@/types/logi';

export default function TrendTasksCard({
  buckets,
  activities,
  weekPlans,
  now,
}: {
  buckets: TrendBucket[];
  activities: Parameters<typeof tallyTasks>[1];
  weekPlans: Map<string, WeekPlan>;
  now: number;
}) {
  const win = useMemo(() => trendWindow(buckets), [buckets]);

  const tallies = useMemo(() => {
    const plan = weeksOf(win).flatMap((w) => {
      const p = weekPlans.get(w);
      return p ? expandPlan(w, p.cells) : [];
    });
    return tallyTasks(plan, activities, win, now);
  }, [win, weekPlans, activities, now]);

  const rate = completionRate(tallies);
  const done = tallies.reduce((a, t) => a + t.completed, 0);
  const planned = tallies.reduce((a, t) => a + t.planned, 0);

  if (rate === null) {
    return (
      <Card title="Tasks">
        <p className="py-8 text-center text-[13px] text-ink-muted">
          No planned tasks in this period. Plan the week in Targets first.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Tasks you always skip are usually misplanned, not laziness.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Tasks" footnote="Tasks you always skip are usually misplanned, not laziness.">
      <p className="text-[13px] tabular-nums text-ink-soft">
        {done}/{planned} planned days done ·{' '}
        <span className="text-ink">{Math.round(rate * 100)}%</span>
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {tallies.map((t) => {
          const pct = t.planned > 0 ? t.completed / t.planned : 0;
          return (
            <li key={t.taskId}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate text-ink">{t.title}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {t.completed}/{t.planned} days
                </span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-1">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
