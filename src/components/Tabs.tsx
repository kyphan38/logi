'use client';

// ---------------------------------------------------------------------------
// logi - Tab bar for Analytics
//
// Three time concepts (range picker, "By day", Trend span) used to stack in one
// long scrolling page, with no clear sense of which controlled which. Tabs cut
// them apart: one question, one way of counting time per tab.
//
// Sticky, because when the tab bar scrolls away readers forget which tab they
// are on. State lives in `useState`, not the URL: the mobile Back button is for
// LEAVING Analytics, not for stepping back through tabs.
// ---------------------------------------------------------------------------
export interface TabItem<T extends string> {
  value: T;
  label: string;
}

export default function Tabs<T extends string>({
  base,
  items,
  value,
  onChange,
  label,
}: {
  /** Id prefix, created by the PARENT page with `useId` and passed to both Tabs
   *  and TabPanel. Calling `useId` in each component makes `aria-controls`
   *  point to an id that does not exist. */
  base: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  // ← → move between tabs and select (automatic activation). Home/End jump to
  // first/last. Only the selected tab has tabIndex 0 - keyboard Tab enters
  // this bar once, not three times.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = items.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    document.getElementById(`${base}-tab-${items[next].value}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-1 rounded-md border border-line-strong bg-surface-1 p-1"
    >
      {items.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            id={`${base}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`${base}-panel-${t.value}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={`min-h-9 flex-1 rounded-sm text-[13px] transition active:scale-[0.98] ${
              on ? 'bg-surface-2 font-medium text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** One tab's content frame. `id`/`aria-labelledby` must match `Tabs`. */
export function TabPanel({
  base,
  value,
  children,
}: {
  base: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${base}-panel-${value}`}
      aria-labelledby={`${base}-tab-${value}`}
      tabIndex={0}
      className="flex flex-col gap-6"
    >
      {children}
    </div>
  );
}
