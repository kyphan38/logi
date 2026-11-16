'use client';

import { btn } from '@/lib/ui';

export default function StreakPrompt({
  count,
  of,
  busy,
  onReset,
  onKeep,
}: {
  count: number;
  of: number;
  busy: boolean;
  onReset: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="mb-6 rounded-md border border-line-strong bg-surface-1 px-4 py-3">
      <p className="text-sm font-medium text-ink">
        Crunch: {count} of the last {of} weeks.
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Reset your baseline, or is this something to fix?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className={`${btn('primary')} flex-1`}
        >
          Reset baseline
        </button>
        <button
          type="button"
          onClick={onKeep}
          className={`${btn('secondary')} flex-1`}
        >
          Keep as is
        </button>
      </div>
    </div>
  );
}
