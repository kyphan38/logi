'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Settings sits top right on every page, like the other apps (hodi TopBar). */
export default function SettingsCorner() {
  const pathname = usePathname();
  const active = pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <div className="content-width flex shrink-0 justify-end px-5 pt-3">
      <Link
        href="/settings"
        aria-current={active ? 'page' : undefined}
        className={`py-1 text-[13px] hover:text-ink active:text-ink ${active ? 'text-ink' : 'text-ink-muted'}`}
      >
        Settings
      </Link>
    </div>
  );
}
