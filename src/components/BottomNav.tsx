'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useIndicator } from '@/hooks/useIndicator';

/** `paths`: every page that lights up this tab. `href` is the first one. */
type Tab = { href: string; paths: string[]; label: string };

// Grouped by time: today, looking back, looking forward.
const TABS: Tab[] = [
  { href: '/now', paths: ['/now'], label: 'Now' },
  { href: '/history', paths: ['/history', '/analytics'], label: 'Review' },
  { href: '/targets', paths: ['/targets', '/reminders'], label: 'Plan' },
];

/**
 * logi's own nav (DESIGN.md "Nav: one signature per app"): no icons, mono
 * uppercase words like a clock face, the open tab marked by a bar on the top
 * edge. fina's bar marks below; keep them apart.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const current = TABS.find((t) =>
    t.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
  );
  const { container, indicator } = useIndicator<HTMLElement, HTMLSpanElement>(current?.href ?? '');

  return (
    <nav
      ref={container}
      aria-label="Main"
      className={[
        // Mobile: the bar sits at the end of the column, NOT `fixed`. `fixed`
        // sticks to the layout viewport bottom - on iOS Safari that is under
        // the toolbar when the page scrolls, so Analytics (a long page) sank
        // while the 3 short tabs did not. As a flex column child all tabs match.
        // Opaque background, no blur: blur makes iOS scrolling stutter.
        // `relative`: the sliding bar below anchors to the nav.
        'relative z-40 flex shrink-0 border-t border-line bg-surface-0 font-mono',
        // Room for the iPhone home indicator.
        'pb-[env(safe-area-inset-bottom)]',
        // Desktop: becomes a left list.
        'md:fixed md:inset-y-0 md:left-0 md:w-[180px] md:flex-col md:gap-1 md:border-r md:border-t-0 md:p-3 md:pt-6',
      ].join(' ')}
    >
      {/* One bar on the top edge of the open tab, over the hairline. Phone only. */}
      <span
        ref={indicator}
        aria-hidden="true"
        className="pointer-events-none absolute -top-px left-0 flex justify-center md:hidden"
      >
        <span className="h-0.5 w-1/2 bg-ink" />
      </span>
      {TABS.map((tab) => {
        const active = tab === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            data-active={active}
            className={[
              'flex min-h-12 flex-1 items-center justify-center text-[11px] uppercase tracking-[0.12em] transition-colors',
              'md:min-h-10 md:flex-none md:justify-start md:px-3',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink active:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
