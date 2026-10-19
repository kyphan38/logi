'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useIndicator } from '@/hooks/useIndicator';

export type SubTab = { href: string; label: string };

/**
 * A two-way switch on top of a bottom-bar tab that holds two pages
 * (Review = History + Analytics, Plan = Targets + Reminder).
 * Each side keeps its own URL, so old links and push notifications still work.
 */
export default function SubTabs({ tabs, label }: { tabs: SubTab[]; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const { container, indicator } = useIndicator<HTMLElement, HTMLSpanElement>(
    tabs.find((t) => isActive(t.href))?.href ?? '',
  );

  return (
    <nav
      ref={container}
      aria-label={label}
      className="relative mb-4 flex shrink-0 rounded-md bg-surface-1 p-1"
    >
      {/* The open side's fill, sliding between the two. */}
      <span
        ref={indicator}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-0 rounded-sm bg-surface-2 shadow-sm"
      />
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            replace
            aria-current={active ? 'page' : undefined}
            data-active={active}
            className={[
              'relative flex min-h-9 flex-1 items-center justify-center rounded-sm text-[13px] font-medium transition',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
