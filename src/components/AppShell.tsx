'use client';

import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import { useOnline } from '@/hooks/useActivities';

/** Banner mảnh trên cùng. Không chặn thao tác — Firestore vẫn ghi vào cache. */
function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="bg-amber-400 px-4 py-1 text-center text-xs font-medium text-amber-950"
      style={{ paddingTop: 'calc(0.25rem + env(safe-area-inset-top))' }}
    >
      Offline — changes will sync
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:pl-56">
      <OfflineBanner />
      {/* pb-20 chừa chỗ cho bottom nav; md thì nav nằm bên trái nên bỏ. */}
      <main className="flex flex-1 flex-col px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 md:pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
