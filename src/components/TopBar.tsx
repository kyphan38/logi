import type { ReactNode } from 'react';
import SettingsLink from '@/components/SettingsLink';

/**
 * The first row of every main page: the page title or its two-way switch on
 * the left, the gear on the right. One fixed height, so the gear never moves
 * between pages. Meta (date, hours) goes in a line below, not in this row.
 */
export default function TopBar({ children, settings = false }: { children: ReactNode; settings?: boolean }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      <SettingsLink current={settings} />
    </header>
  );
}
