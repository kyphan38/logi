import type { ReactNode } from 'react';
import SettingsLink from '@/components/SettingsLink';

/**
 * The first row of every main page: the page title or its two-way switch on
 * the left, the gear on the right. One fixed height, so the gear never moves
 * between pages. Meta (date, hours) goes in a line below, not in this row.
 * The hairline under it sits at the same height on every page, as in fina.
 */
export default function TopBar({ children, settings = false }: { children: ReactNode; settings?: boolean }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line">
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      <SettingsLink current={settings} />
    </header>
  );
}
