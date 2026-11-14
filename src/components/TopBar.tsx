import type { ReactNode } from 'react';
import SettingsLink from '@/components/SettingsLink';

/**
 * The first row of every main page: the page title or its two-way switch on
 * the left, the gear on the right. One fixed height, so the gear never moves
 * between pages. Meta (date, hours) goes in a line below, not in this row.
 * No hairline under it: that look is fina's (DESIGN.md "Nav: one signature
 * per app"). The row below is min-h-11 with centered text on every page, so
 * its text starts at one height whether or not it holds a button.
 */
export default function TopBar({ children, settings = false }: { children: ReactNode; settings?: boolean }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      <SettingsLink current={settings} />
    </header>
  );
}
