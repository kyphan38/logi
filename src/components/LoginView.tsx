'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginView() {
  const { user, loading, signingIn, error, signIn } = useAuth();
  const router = useRouter();

  // Đã đăng nhập rồi mà vẫn mở /login thì đi thẳng vào app.
  useEffect(() => {
    if (!loading && user) router.replace('/now');
  }, [loading, user, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">logi</h1>
        <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
          Track where your time really goes.
        </p>
      </div>

      <button
        type="button"
        onClick={signIn}
        disabled={loading || signingIn}
        className="flex h-12 w-full max-w-xs items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {signingIn ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
            />
            <span>Signing in…</span>
          </>
        ) : (
          <>
            <GoogleMark />
            <span>Continue with Google</span>
          </>
        )}
      </button>

      {error ? (
        <p
          role="alert"
          className="max-w-xs text-center text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
