'use client';

// ============================================================
// logi - One weekly balance line, on the Now screen.
//
// Gray only (DESIGN.md): the words already say over or short.
// Over / conflict is a bit bolder. This app does not judge.
// ============================================================

import Link from 'next/link';

import type { BannerLine } from '@/lib/banner';

const TONE: Record<BannerLine['kind'], string> = {
  conflict: 'border-line-strong bg-surface-1 font-medium text-ink',
  over: 'border-line-strong bg-surface-1 font-medium text-ink',
  under: 'border-line-strong bg-surface-1 text-ink',
  // Not enough data: a faint line, no colored frame - it is a note, not a warning.
  sparse: 'border-transparent bg-surface-1 text-ink-muted',
};

export default function BalanceBanner({ line }: { line: BannerLine | null }) {
  if (!line) return null; // Nothing to say, say nothing.

  return (
    <Link
      href="/targets"
      className={[
        'flex items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm transition active:scale-[0.99]',
        TONE[line.kind],
      ].join(' ')}
    >
      <span className="tabular-nums">{line.text}</span>
      <span aria-hidden="true" className="shrink-0 opacity-60">
        ›
      </span>
    </Link>
  );
}
