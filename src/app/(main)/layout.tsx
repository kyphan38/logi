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

  if (loading || !user) return <Skeleton />;

  return <AppShell>{children}</AppShell>;
}

function Skeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-32 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
