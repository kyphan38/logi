'use client';

import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:pl-56">
      {/* pb-20 chừa chỗ cho bottom nav; md thì nav nằm bên trái nên bỏ. */}
      <main className="flex flex-1 flex-col px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 md:pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
