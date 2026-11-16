'use client';

export default function ModeCard({
  label,
  hint,
  summary: line,
  selected,
  suggested = false,
  lockedReason = null,
  disabled,
  onSelect,
}: {
  label: string;
  hint: string;
  summary: string;
  selected: boolean;
  /** Suggested by the AI on Analytics. Only a hint, nothing applied. */
  suggested?: boolean;
  lockedReason?: string | null;
  disabled: boolean;
  onSelect: () => void;
}) {
  const off = disabled || lockedReason !== null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={off}
      aria-pressed={selected}
      className={[
        'w-full rounded-md border px-4 py-3 text-left transition',
        selected
          ? 'border-ink bg-surface-1'
          : 'border-line',
        off ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.99]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-ink">{label}</span>
        {selected ? (
          <span className="text-ink">✓</span>
        ) : suggested ? (
          <span className="text-xs text-ink-muted">Suggested</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        {lockedReason ?? hint}
      </p>
      <p className="mt-1 font-mono text-xs text-ink-muted">{line}</p>
    </button>
  );
}
