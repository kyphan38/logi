'use client';

// ============================================================
// logi - Một dòng cân bằng tuần, đặt ở màn hình Now.
//
// Màu: vượt → hổ phách, thiếu → xanh dương nhạt.
// KHÔNG dùng đỏ. Đỏ để dành cho lỗi hệ thống, không dành cho
// hành vi của người dùng. App này không phán xét.
// ============================================================

import Link from 'next/link';

import type { BannerLine } from '@/lib/banner';

const TONE: Record<BannerLine['kind'], string> = {
  conflict:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
  over: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
  under:
    'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200',
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
