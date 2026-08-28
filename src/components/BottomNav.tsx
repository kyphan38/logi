'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Tab = { href: string; label: string; icon: ReactNode };

const TABS: Tab[] = [
  { href: '/now', label: 'Now', icon: <IconNow /> },
  { href: '/history', label: 'History', icon: <IconHistory /> },
  { href: '/targets', label: 'Targets', icon: <IconTargets /> },
  { href: '/analytics', label: 'Analytics', icon: <IconAnalytics /> },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={[
        // Mobile: thanh cố định dưới đáy.
        // Nền đục, không blur: blur trên thanh fixed làm iOS cuộn giật.
        'fixed inset-x-0 bottom-0 z-40 flex border-t border-zinc-200 bg-white',
        'dark:border-zinc-800 dark:bg-zinc-950',
        // Chừa chỗ cho home indicator của iPhone.
        'pb-[env(safe-area-inset-bottom)]',
        // Desktop: đổi thành sidebar bên trái.
        'md:inset-x-auto md:inset-y-0 md:left-0 md:w-[180px] md:flex-col md:gap-1 md:border-r md:border-t-0 md:p-3 md:pb-3',
      ].join(' ')}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition',
              'md:h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:text-sm',
              active
                ? 'text-blue-600 md:bg-blue-50 dark:text-blue-400 dark:md:bg-blue-950/40'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'flex h-6 w-6 items-center justify-center rounded-full md:h-5 md:w-5',
                active ? 'md:bg-transparent' : '',
              ].join(' ')}
            >
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {/* Gạch đậm dưới tab đang mở — nhìn là thấy ngay. */}
            <span
              aria-hidden="true"
              className={[
                'absolute bottom-[env(safe-area-inset-bottom)] h-0.5 w-10 rounded-full md:hidden',
                active ? 'bg-blue-600 dark:bg-blue-400' : 'bg-transparent',
              ].join(' ')}
            />
          </Link>
        );
      })}
    </nav>
  );
}

function IconNow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}

function IconTargets() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full">
      <path d="M6 19V10M12 19V5M18 19v-6" strokeLinecap="round" />
    </svg>
  );
}
