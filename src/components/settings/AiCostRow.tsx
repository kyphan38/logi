'use client';

import { useEffect, useState } from 'react';

import { formatUsd, monthLabel, splitMonths, type MonthCost } from '@/lib/ai-cost';
import { loadAiCosts } from '@/lib/ai-usage';

/** Gemini cost this month; a tap lists the earlier months. Hidden if it cannot load. */
export default function AiCostRow() {
  const [rows, setRows] = useState<MonthCost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    loadAiCosts()
      .then((r) => live && setRows(r))
      .catch((err) => {
        console.warn('[ai-cost] load failed', err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;
  const { current, past } = splitMonths(rows ?? [], Date.now());

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 text-[13px]">
        <span className="text-ink-muted">This month</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="tabular-nums text-ink"
        >
          {rows ? formatUsd(current) : '…'}
          <span aria-hidden className="ml-1.5 text-ink-soft">{open ? '▴' : '▾'}</span>
        </button>
      </div>
      {open && (
        <ul className="mt-2 space-y-1 text-[13px] text-ink-soft">
          {past.length === 0 ? (
            <li>No earlier months</li>
          ) : (
            past.map((r) => (
              <li key={r.month} className="flex justify-between tabular-nums">
                <span>{monthLabel(r.month)}</span>
                <span>{formatUsd(r.usd)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
