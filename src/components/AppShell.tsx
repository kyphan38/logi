'use client';

import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import { useOnline } from '@/hooks/useActivities';

/** A thin banner on top. Blocks nothing - Firestore still writes to the cache. */
function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="bg-zinc-900 px-4 py-1 text-center text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      style={{ paddingTop: 'calc(0.25rem + env(safe-area-inset-top))' }}
    >
      Offline - changes will sync
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    // h-dvh: the frame is exactly the screen height. The document is never
    // taller than the viewport -> the page never scrolls -> the Safari toolbar
    // does not collapse/expand -> the tab bar stays put. Everything scrolls in <main>.
    <div className="flex h-dvh min-h-0 flex-col md:pl-[180px]">
      <OfflineBanner />
      {/* The ONLY scrollable place. The nav is a sibling below, no longer
          `fixed`, so it stays in one place whether the page is long or short.
          content-width: every screen is capped at 720px and centered. */}
      <main
        id="app-scroll"
        className="content-width flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-6 pt-6"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
