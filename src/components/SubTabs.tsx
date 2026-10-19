'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SubTab = { href: string; label: string };

/**
 * A two-way switch on top of a bottom-bar tab that holds two pages
 * (Review = History + Analytics, Plan = Targets + Reminder).
 * Each side keeps its own URL, so old links and push notifications still work.
 */
export default function SubTabs({ tabs, label }: { tabs: SubTab[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="mb-4 flex shrink-0 rounded-md bg-surface-1 p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            replace
            aria-current={active ? 'page' : undefined}
            className={[
              'flex min-h-9 flex-1 items-center justify-center rounded-sm text-[13px] font-medium transition',
              active ? 'bg-surface-2 text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
