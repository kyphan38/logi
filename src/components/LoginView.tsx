'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginView() {
  const { user, loading, signingIn, sessionReady, error, signIn } = useAuth();
  const router = useRouter();

  // Đã đăng nhập rồi mà vẫn mở /login thì đi thẳng vào app. Chờ cookie server
  // xong mới đi: đi sớm hơn thì layout (main) chưa thấy session và đá ngược
  // về đây.
  useEffect(() => {
    if (!loading && user && sessionReady) router.replace('/now');
  }, [loading, user, sessionReady, router]);

  // Cùng một màn login cho mọi app trong ws/app (theo hodi): icon, tên,
  // một dòng mô tả, một nút viền "Continue with Google". Không logo Google.
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-5 pb-[12dvh] text-center">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh, không cần tối ưu ảnh */}
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
