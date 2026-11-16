'use client';

import SheetShell from '@/components/SheetShell';
import { type Weekly } from '@/lib/rollover';
import { previewSwitch } from '@/lib/targets';
import { CATEGORY_LABEL, PRESETS, type PresetId, type WeekTarget } from '@/types/logi';
import { btn } from '@/lib/ui';
import { h } from '@/lib/targets-view';

export default function ConfirmSheet({
  to,
  from,
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  to: PresetId;
  from: Weekly;
  target: WeekTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rows = previewSwitch(from, to, target?.debtApplied ?? {}).filter(
    (r) => Math.abs(r.to - r.from) > 0.05
  );

  return (
    <SheetShell
      onClose={onCancel}
      label={`Switch to ${PRESETS[to].label}`}
      center
      className="w-full max-w-lg rounded-t-lg bg-surface-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-lg md:pb-5"
      header={
        <h3 className="mb-3 text-base font-semibold text-ink">
          Switch to {PRESETS[to].label}
        </h3>
      }
    >

      <div className="mb-4">
        {rows.map((r) => (
          <div key={r.category} className="flex items-baseline justify-between py-1 text-sm">
            <span className="text-ink-soft">
              {CATEGORY_LABEL[r.category]}
            </span>
            <span className="font-mono tabular-nums text-ink">
              {h(r.from)} → {h(r.to)}
              {/* Changing preset without seeing the cost makes this mechanism pointless. */}
              {r.debt > 0 && (
                <span className="ml-2 font-medium text-ink">
                  +{h(r.debt)} debt
                </span>
              )}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-ink-muted">No change to your targets.</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`${btn('secondary')} flex-1`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`${btn('primary')} flex-1`}
        >
          Switch
        </button>
      </div>
    </SheetShell>
  );
}
