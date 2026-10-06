'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginView() {
  const { user, loading, signingIn, sessionReady, error, signIn } = useAuth();
  const router = useRouter();

  // Already signed in but on /login → go straight into the app. Wait for the
  // server cookie first: leaving earlier, the (main) layout sees no session
  // and bounces back here.
  useEffect(() => {
    if (!loading && user && sessionReady) router.replace('/now');
  }, [loading, user, sessionReady, router]);

  // The same login screen for every app in ws/app (after hodi): icon, name,
  // one line of description, one outlined "Continue with Google" button. No Google logo.
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-5 pb-[12dvh] text-center">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no image optimization needed */}
        <img src="/branding/logi-icon.svg" alt="" width={40} height={40} />
        <div>
          <h1 className="text-xl font-medium tracking-tight text-ink">logi</h1>
          <p className="mt-1 text-sm text-ink-muted">Where your time really goes.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={signIn}
        disabled={loading || signingIn}
        className="w-full max-w-xs rounded-full border border-line px-4 py-3 text-sm text-ink transition-colors hover:bg-ink/[0.06] disabled:opacity-40"
      >
        {signingIn ? 'Signing in…' : 'Continue with Google'}
      </button>

      {error ? (
        <p role="alert" className="max-w-xs text-sm text-ink-soft">
          {error}
        </p>
      ) : null}
    </main>
  );
}
