'use client';

// ============================================================
// logi - Một dòng cân bằng tuần, đặt ở màn hình Now.
//
// Chỉ xám (DESIGN.md): chữ trong dòng đã nói vượt hay thiếu.
// Vượt / xung đột thì chữ đậm hơn một chút. App này không phán xét.
// ============================================================

import Link from 'next/link';

import type { BannerLine } from '@/lib/banner';

const TONE: Record<BannerLine['kind'], string> = {
  conflict: 'border-line-strong bg-surface-1 font-medium text-ink',
  over: 'border-line-strong bg-surface-1 font-medium text-ink',
  under: 'border-line-strong bg-surface-1 text-ink',
  // Chưa đủ dữ liệu: dòng nhạt, không khung màu - nó là ghi chú, không phải cảnh báo.
  sparse: 'border-transparent bg-surface-1 text-ink-muted',
};

export default function BalanceBanner({ line }: { line: BannerLine | null }) {
  if (!line) return null; // Không có gì để nói thì không nói gì.

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
