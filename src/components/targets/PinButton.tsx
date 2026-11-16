'use client';

/** Small lock next to each category. Closed = nobody can take its hours. */
export default function PinButton({
  pinned,
  canPin,
  disabled,
  label,
  onClick,
}: {
  pinned: boolean;
  canPin: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const off = disabled || (!pinned && !canPin);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      className={[
        'shrink-0 rounded p-1 transition',
        pinned ? 'text-ink' : 'text-line-strong',
        off ? 'cursor-not-allowed opacity-40' : 'active:scale-90',
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        {pinned ? (
          <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
        ) : (
          <path d="M8 11V7a4 4 0 0 1 7.5-2" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
