'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, uid, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Draw the app shell even before auth finishes. AppShell and BottomNav need no
  // user: BottomNav only reads the pathname, OfflineBanner only navigator.onLine.
  // With last session's uid the page renders at once from the Firestore cache;
  // the skeleton only shows on a first sign-in on this device.
  return <AppShell>{uid ? children : <Skeleton />}</AppShell>;
}

function Skeleton() {
  return (
    // No px-5 pt-6 here: <main> in AppShell already has padding; adding it
    // would indent twice compared with the real content.
    <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-32 breathe rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full breathe rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full breathe rounded-md bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
