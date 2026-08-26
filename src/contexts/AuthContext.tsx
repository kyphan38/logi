'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

const NOT_AUTHORIZED = 'This account is not authorized.';
const UNAUTHORIZED_DOMAIN =
  'This domain is not allowed to sign in. Add it in Firebase Console → Authentication → Settings → Authorized domains, then try again.';
const GENERIC = 'Sign-in failed. Please try again.';

type AuthState = {
  user: User | null;
  /** true khi chưa biết đã đăng nhập hay chưa (lần kiểm tra đầu tiên). */
  loading: boolean;
  /** true khi người dùng vừa bấm nút đăng nhập. */
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function newProvider() {
  const provider = new GoogleAuthProvider();
  // Luôn cho chọn tài khoản — quan trọng khi cần thử email ngoài allowlist.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tránh gọi POST /api/auth/session nhiều lần cho cùng một user.
  const syncedUid = useRef<string | null>(null);

  /** Đổi ID token lấy session cookie. Trả true nếu server chấp nhận. */
  const exchangeToken = useCallback(
    async (current: User): Promise<boolean> => {
      const idToken = await current.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (res.status === 403) {
        syncedUid.current = null;
        await firebaseSignOut(auth);
        setError(NOT_AUTHORIZED);
        return false;
      }

      if (!res.ok) {
        let message = GENERIC;
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // giữ message mặc định
        }
        setError(message);
        return false;
      }

      syncedUid.current = current.uid;
      setError(null);
      return true;
    },
    [],
  );

  // Kết quả của signInWithRedirect (đường lui khi popup bị chặn trên iOS).
  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth)
      .then(async (result) => {
        if (cancelled || !result?.user) return;
        const ok = await exchangeToken(result.user);
        if (ok) router.replace('/now');
      })
      .catch(() => {
        // onAuthStateChanged vẫn sẽ chạy; không chặn app vì lỗi ở đây.
      });
    return () => {
      cancelled = true;
    };
  }, [exchangeToken, router]);

  // Nguồn sự thật cho user phía client.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      setUser(next);
      setLoading(false);

      if (!next) {
        syncedUid.current = null;
        return;
      }
      if (syncedUid.current === next.uid) return;

      // Client còn user nhưng cookie server có thể đã hết hạn (sau 14 ngày)
      // → làm mới cookie.
      try {
        const res = await fetch('/api/auth/session', { method: 'GET' });
        const body = await res.json();
        if (body?.authenticated === true) {
          syncedUid.current = next.uid;
          return;
        }
      } catch {
        // Offline: giữ nguyên trạng thái, không đá người dùng ra ngoài.
        return;
      }
      await exchangeToken(next);
    });
    return unsub;
  }, [exchangeToken]);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      const result = await signInWithPopup(auth, newProvider());
      const ok = await exchangeToken(result.user);
      if (ok) router.push('/now');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // Người dùng tự đóng — im lặng.
      } else if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        // iOS Safari/Edge hay chặn popup → chuyển sang redirect.
        try {
          await signInWithRedirect(auth, newProvider());
          return; // trang sẽ điều hướng đi, giữ signingIn = true
        } catch {
          setError(GENERIC);
        }
      } else if (code === 'auth/unauthorized-domain') {
        setError(UNAUTHORIZED_DOMAIN);
      } else if (code === 'auth/network-request-failed') {
        setError('No network connection. Check your connection and try again.');
      } else {
        setError(GENERIC);
      }
    } finally {
      setSigningIn(false);
    }
  }, [exchangeToken, router]);

  const signOut = useCallback(async () => {
    setError(null);
    syncedUid.current = null;
    try {
      await firebaseSignOut(auth);
    } finally {
      // Thiếu bước này thì cookie vẫn còn và server vẫn coi là đã đăng nhập.
      try {
        await fetch('/api/auth/session', { method: 'DELETE' });
      } catch {
        // ignore
      }
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signingIn, error, signIn, signOut }),
    [user, loading, signingIn, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
