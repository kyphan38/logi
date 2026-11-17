'use client';

import { useMemo, useState } from 'react';

import Card from '@/components/Card';
import { useFirstDate, useYearData } from '@/hooks/useYearData';
import { logicalDate } from '@/lib/balance';
import { monthName, yearChoices, yearSummary } from '@/lib/year-summary';
import { CATEGORIES, CATEGORY_LABEL } from '@/types/logi';

const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** G5: this year or an earlier one: totals, weekly averages, bedtime, months. */
export default function YearTab({ now }: { now: number }) {
  const first = useFirstDate();
  const years = useMemo(() => yearChoices(first ?? null, now), [first, now]);
  const [year, setYear] = useState(() => logicalDate(now).slice(0, 4));
  const { data, loading, error } = useYearData(year, now);
  const s = useMemo(() => (data ? yearSummary(year, data.activities, data.dayLogs, now) : null), [data, year, now]);
  const peak = s ? Math.max(1, ...s.months.map((m) => m.total)) : 1;

  return (
    <div className="flex flex-col gap-6">
      {years.length > 1 && (
        <div role="group" aria-label="Year" className="flex flex-wrap gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={year === y}
              onClick={() => setYear(y)}
              className={`min-h-9 rounded-sm border px-3 text-[13px] tabular-nums transition active:scale-[0.98] ${
                year === y ? 'border-line-strong bg-surface-2 font-medium text-ink' : 'border-line text-ink-soft'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="text-[13px] text-ink-soft">{error}</p>
      ) : loading || !s ? (
        <div className="h-40 breathe rounded-md bg-surface-1" aria-busy="true" aria-label="Loading" />
      ) : (
        <>
          <Card title={year}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[12px] text-ink-muted">
                  <th className="pb-1.5 font-normal" />
                  <th className="pb-1.5 text-right font-normal">Total</th>
                  <th className="pb-1.5 text-right font-normal">Per week</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((c) => (
                  <tr key={c}>
                    <td className="py-1 text-ink">{CATEGORY_LABEL[c]}</td>
                    <td className="py-1 text-right text-ink">{Math.round(s.totals[c])}h</td>
                    <td className="py-1 text-right text-ink-soft">{h1(s.weekly[c])}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-ink-muted">Usual bedtime</dt>
              <dd className="tabular-nums text-ink">{s.bedtime ? `${s.bedtime} · ${s.nights} nights` : '-'}</dd>
              <dt className="text-ink-muted">Best month</dt>
              <dd className="text-ink">{s.best ? monthName(s.best) : '-'}</dd>
              <dt className="text-ink-muted">Worst month</dt>
              <dd className="text-ink">{s.worst ? monthName(s.worst) : '-'}</dd>
            </dl>
          </Card>

          <Card title="By month" footnote="Hours logged in each month.">
            <div className="flex h-32 items-end gap-1.5">
              {s.months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className={`w-full rounded-t-sm ${m.month === s.best ? 'bg-ink' : 'bg-ink-muted/50'}`}
                    style={{ height: `${(m.total / peak) * 100}%` }}
                    title={`${monthName(m.month)}: ${h1(m.total)}h`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">
              {s.months.map((m) => (
                <span
                  key={m.month}
                  className={`flex-1 text-center text-[10px] ${m.started ? 'text-ink-muted' : 'text-ink-muted/40'}`}
                >
                  {monthName(m.month).slice(0, 1)}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
