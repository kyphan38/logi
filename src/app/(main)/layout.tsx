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

  // Draw the app shell even before auth finishes. AppShell and BottomNav need no
  // user: BottomNav only reads the pathname, OfflineBanner only navigator.onLine.
  // The user sees the app open, instead of three gray boxes on a white screen.
  return <AppShell>{loading || !user ? <Skeleton /> : children}</AppShell>;
}

function Skeleton() {
  return (
    // No px-5 pt-6 here: <main> in AppShell already has padding; adding it
    // would indent twice compared with the real content.
    <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-32 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
