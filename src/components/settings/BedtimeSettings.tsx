'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useSleepPlan } from '@/hooks/useSleepPlan';
import { bedtimeMinute, clockOf, type SleepPlan } from '@/lib/sleep-plan';
import { saveSleep } from '@/lib/sleep-store';

const HOURS = Array.from({ length: 17 }, (_, i) => 4 + i / 2);
const FIELD = 'rounded-sm border border-line bg-surface-2 px-2 py-1 text-sm tabular-nums text-ink';

/** G10: wake time and hours of sleep give the bedtime; push 30 minutes before. */
export default function BedtimeSettings() {
  const { uid } = useAuth();
  const plan = useSleepPlan();
  const save = (patch: Partial<SleepPlan>) => {
    if (uid) void saveSleep(uid, { ...plan, ...patch });
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">Bedtime reminder</h2>
        <button
          type="button"
          role="switch"
          aria-checked={plan.on}
          onClick={() => save({ on: !plan.on })}
          disabled={!uid}
          className={`text-sm ${plan.on ? 'font-medium text-ink' : 'text-ink-muted'}`}
        >
          {plan.on ? 'On' : 'Off'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-muted">
        <label className="flex items-center gap-2">
          Wake
          <input
            type="time"
            value={plan.wake}
            onChange={(e) => e.target.value && save({ wake: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className="flex items-center gap-2">
          Sleep
          <select value={plan.hours} onChange={(e) => save({ hours: Number(e.target.value) })} className={FIELD}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums text-ink-soft">Bed at {clockOf(bedtimeMinute(plan))}</span>
      </div>
    </section>
  );
}
