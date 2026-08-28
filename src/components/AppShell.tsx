'use client';

import type { ReactNode } from 'react';
import BottomNav from '@/components/BottomNav';
import { useOnline } from '@/hooks/useActivities';

/** Banner mảnh trên cùng. Không chặn thao tác - Firestore vẫn ghi vào cache. */
function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="bg-amber-400 px-4 py-1 text-center text-xs font-medium text-amber-950"
      style={{ paddingTop: 'calc(0.25rem + env(safe-area-inset-top))' }}
    >
      Offline - changes will sync
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    // h-dvh: khung cao đúng bằng màn hình. Tài liệu không bao giờ dài hơn
    // viewport -> trang không tự cuộn -> thanh công cụ Safari không thu/nhả ->
    // thanh tab đứng yên. Mọi thứ cuộn bên trong <main>.
    <div className="flex h-dvh min-h-0 flex-col md:pl-[180px]">
      <OfflineBanner />
      {/* Đây là NƠI DUY NHẤT cuộn được. Nav là anh em phía dưới, không phải
          `fixed` nữa, nên nó nằm đúng một chỗ dù trang dài hay ngắn.
          content-width: mọi màn hình giới hạn 720px và căn giữa. */}
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
