'use client';

import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/types/logi';
import { LABEL } from '@/lib/ui';
import { h } from '@/lib/targets-view';

export default function DebtSection({
  debt,
  applied,
}: {
  debt: Partial<Record<Category, number>>;
  applied: Partial<Record<Category, number>>;
}) {
  const rows = CATEGORIES.filter((c) => (debt[c] ?? 0) > 0 || (applied[c] ?? 0) > 0);
  if (rows.length === 0) return null; // No debt, no section.

  return (
    <section className="mb-6">
      <h2 className={`${LABEL} mb-2`}>Debt</h2>
      <div className="rounded-md border border-line px-4 py-3">
        {rows.map((c) => (
          <div key={c} className="flex items-baseline justify-between py-1 text-sm">
            <span className="text-ink-soft">{CATEGORY_LABEL[c]}</span>
            <span className="font-mono tabular-nums text-ink">
              {h(debt[c] ?? 0)}
              {(applied[c] ?? 0) > 0 && (
                <span className="ml-2 text-xs font-normal text-ink-muted">
                  ({h(applied[c]!)} applied this week)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
