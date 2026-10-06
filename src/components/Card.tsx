'use client';

// ---------------------------------------------------------------------------
// logi - A frame for ONE chart / ONE table
//
// Analytics sections used to be separated only by white space. Scrolling on a
// 375px screen, one chart's X-axis labels sat right above the next chart's
// title, and the eye could not tell which numbers belonged to which chart.
//
// One chart = one frame. Three fixed slots:
//   - `title`     top left, small caps
//   - `action`    top right - the only place for that chart's dropdown
//   - `footnote`  frame bottom - how to read it, not a color legend
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';

interface Props {
  title?: string;
  /** This chart's own controls (dropdown…). Always on the same row as the title. */
  action?: ReactNode;
  /** A short line on how to read the chart. At the bottom, after looking at it. */
  footnote?: ReactNode;
  children: ReactNode;
  /** Screen reader label when the frame has no visible `title`. */
  label?: string;
}

export default function Card({ title, action, footnote, children, label }: Props) {
  return (
    <section
      aria-label={label ?? title}
      className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-2 p-4"
    >
      {/* flex-wrap: a frame with many dropdowns wraps its action below the
          title, instead of squeezing the cells until text is cut. */}
      {(title || action) && (
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {title ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}

      {children}

      {footnote && <p className="text-[11px] leading-snug text-ink-muted">{footnote}</p>}
    </section>
  );
}

/**
 * Dropdown for `action`. A real `<select>`, not a hand-built menu: on iOS it
 * opens the system picker wheel, never misplaced or clipped by a parent with
 * `overflow-hidden`.
 */
export function CardSelect<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-sm border border-line-strong bg-surface-1 py-1 pl-2.5 pr-7 text-[13px] text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ink-muted"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
