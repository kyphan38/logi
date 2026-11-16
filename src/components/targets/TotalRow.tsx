'use client';

import { type Weekly } from '@/lib/rollover';
import { CATEGORIES, TOTAL_BUDGET } from '@/types/logi';

export default function TotalRow({ weekly, errors }: { weekly: Weekly; errors: string[] }) {
  const total = CATEGORIES.reduce((a, c) => a + weekly[c], 0);
  const ok = errors.length === 0;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-muted">Total</span>
        <span
          className={[
            'font-mono tabular-nums',
            ok ? 'text-ink' : 'font-medium text-ink',
          ].join(' ')}
        >
          {Math.round(total * 10) / 10} / {TOTAL_BUDGET}h {ok ? '✓' : ''}
        </span>
      </div>
      {errors.map((e) => (
        <p key={e} className="mt-1 text-xs font-medium text-ink">
          {e}
        </p>
      ))}
    </div>
  );
}
