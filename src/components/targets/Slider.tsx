'use client';

import { CATEGORY_COLOR, CATEGORY_LABEL, HARD_FLOOR, type Category } from '@/types/logi';
import PinButton from '@/components/targets/PinButton';
import { h } from '@/lib/targets-view';

export default function Slider({
  category,
  value,
  min,
  max,
  pinned,
  derived,
  canPin,
  disabled,
  onChange,
  onTogglePin,
}: {
  category: Category;
  value: number;
  /** This category's hard floor. */
  min: number;
  /** The REAL cap after pinned hours - not always 70h. */
  max: number;
  pinned: boolean;
  /** The other three are pinned → this number is the rest, read-only. */
  derived: boolean;
  canPin: boolean;
  disabled: boolean;
  onChange: (v: number) => void;
  onTogglePin: () => void;
}) {
  const floor = HARD_FLOOR[category] ?? 0;
  // At the floor, say so clearly, and `min` blocks it - no dragging lower.
  const atFloor = value <= floor + 0.05 && floor > 0;
  // 70h is the slider's limit; `max` is the budget's limit.
  const ceiling = Math.max(min, Math.min(70, max));

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="flex items-center gap-1.5 text-ink-soft">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: CATEGORY_COLOR[category] }}
          />
          {CATEGORY_LABEL[category]}
          {atFloor && (
            <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-surface-0">
              floor
            </span>
          )}
          {derived && (
            <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
              auto
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <span className="font-mono tabular-nums text-ink">
            {h(value)}
          </span>
          <PinButton
            pinned={pinned}
            canPin={canPin}
            disabled={derived}
            label={CATEGORY_LABEL[category]}
            onClick={onTogglePin}
          />
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={ceiling}
        step={0.5}
        value={value}
        disabled={disabled}
        aria-label={CATEGORY_LABEL[category]}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          'h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50',
          atFloor ? 'bg-ink-muted' : 'bg-sunk',
        ].join(' ')}
      />
    </div>
  );
}
