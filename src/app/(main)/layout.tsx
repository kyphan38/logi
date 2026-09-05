'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Vẽ vỏ app ngay cả khi auth chưa xong. AppShell và BottomNav không cần user:
  // BottomNav chỉ đọc pathname, OfflineBanner chỉ đọc navigator.onLine. Người dùng
  // thấy app đã mở, thay vì ba ô xám lửng lơ giữa màn hình trắng.
  return <AppShell>{loading || !user ? <Skeleton /> : children}</AppShell>;
}

function Skeleton() {
  return (
    // Không thêm px-5 pt-6 ở đây: <main> trong AppShell đã có sẵn padding,
    // để nguyên sẽ bị thụt lề hai lần so với nội dung thật.
    <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-32 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
