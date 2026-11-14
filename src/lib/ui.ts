// Shared class strings for the few controls every screen repeats.
// One source, so a button looks the same on Now, in a sheet and in Settings.

export type ButtonKind = 'primary' | 'secondary' | 'word';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40';

const KIND: Record<ButtonKind, string> = {
  // At most one per screen: the main action.
  primary: 'rounded-md bg-ink font-medium text-surface-0',
  // Only next to a primary, e.g. Cancel beside Save in a sheet.
  secondary: 'rounded-md border border-line-strong font-medium text-ink',
  // Everything else: a plain word, ink on hover or press.
  word: 'text-ink-soft hover:text-ink active:text-ink',
};

const SIZE: Record<ButtonKind, Record<ButtonSize, string>> = {
  primary: { md: 'min-h-11 px-4 text-sm', sm: 'min-h-9 px-3 text-[13px]' },
  secondary: { md: 'min-h-11 px-4 text-sm', sm: 'min-h-9 px-3 text-[13px]' },
  word: { md: 'min-h-11 px-1 text-[13px]', sm: 'min-h-9 px-1 text-[13px]' },
};

/** Class string for a button or a link styled as one. Add layout (flex-1, w-full) after it. */
export function btn(kind: ButtonKind = 'primary', size: ButtonSize = 'md'): string {
  return `${BASE} ${KIND[kind]} ${SIZE[kind][size]}`;
}

/** Section label: the nav's mono uppercase type, so headings and tabs read as one family. */
export const LABEL = 'font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-muted';
