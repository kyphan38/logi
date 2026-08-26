'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function NowPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Now</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {user?.email ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="h-9 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 active:scale-[0.99] dark:border-zinc-700 dark:text-zinc-200"
        >
          Sign out
        </button>
      </header>
      <Placeholder stage="Stage 2" />
    </div>
  );
}

function Placeholder({ stage }: { stage: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      Coming in {stage}
    </div>
  );
}
