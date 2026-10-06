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
import { isStandalone } from '@/lib/standalone';

const NOT_AUTHORIZED = 'This account is not authorized.';
const UNAUTHORIZED_DOMAIN =
  'This domain is not allowed to sign in. Add it in Firebase Console → Authentication → Settings → Authorized domains, then try again.';
const GENERIC = 'Sign-in failed. Please try again.';

type AuthState = {
  user: User | null;
  /** true while sign-in state is unknown (first check). */
  loading: boolean;
  /** true right after the user taps sign in. */
  signingIn: boolean;
  /** true once the server has a session cookie for the current user. */
  sessionReady: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function newProvider() {
  const provider = new GoogleAuthProvider();
  // Always let the user pick an account - matters when testing an email outside the allowlist.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  // Avoid calling POST /api/auth/session several times for the same user.
  const syncedUid = useRef<string | null>(null);

  /** Exchange an ID token for a session cookie. Returns true if the server accepts. */
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
        setSessionReady(false);
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
          // keep the default message
        }
        setError(message);
        return false;
      }

      syncedUid.current = current.uid;
      setSessionReady(true);
      setError(null);
      return true;
    },
    [],
  );

  // Result of signInWithRedirect (fallback when iOS blocks the popup).
  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth)
      .then(async (result) => {
        if (cancelled || !result?.user) return;
        const ok = await exchangeToken(result.user);
        if (ok) router.replace('/now');
      })
      .catch(() => {
        // onAuthStateChanged still runs; an error here does not block the app.
      });
    return () => {
      cancelled = true;
    };
  }, [exchangeToken, router]);

  // Source of truth for the client-side user.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (next) => {
      setUser(next);
      setLoading(false);

      if (!next) {
        syncedUid.current = null;
        setSessionReady(false);
        return;
      }
      if (syncedUid.current === next.uid) return;

      // The client still has a user but the server cookie may have expired
      // (after 14 days) → refresh the cookie.
      try {
        const res = await fetch('/api/auth/session', { method: 'GET' });
        const body = await res.json();
        if (body?.authenticated === true) {
          syncedUid.current = next.uid;
          setSessionReady(true);
          return;
        }
      } catch {
        // Offline: keep the current state, do not kick the user out.
        return;
      }
      await exchangeToken(next);
    });
    return unsub;
  }, [exchangeToken]);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);

    // iOS Home Screen app: the popup opens a separate page that cannot report
    // back after sign-in, so the button stays on "Signing in…". Go straight to
    // redirect (works thanks to the same-domain authDomain, see firebase-client.ts).
    if (isStandalone()) {
      try {
        await signInWithRedirect(auth, newProvider());
        return; // the page will navigate away, keep signingIn = true
      } catch {
        setError(GENERIC);
        setSigningIn(false);
        return;
      }
    }

    try {
      const result = await signInWithPopup(auth, newProvider());
      const ok = await exchangeToken(result.user);
      if (ok) router.push('/now');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // The user closed it - stay quiet.
      } else if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        // iOS Safari/Edge often block popups → switch to redirect.
        try {
          await signInWithRedirect(auth, newProvider());
          return; // the page will navigate away, keep signingIn = true
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
    setSessionReady(false);
    try {
      await firebaseSignOut(auth);
    } finally {
      // Without this step the cookie stays and the server still sees a signed-in user.
      try {
        await fetch('/api/auth/session', { method: 'DELETE' });
      } catch {
        // ignore
      }
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signingIn, sessionReady, error, signIn, signOut }),
    [user, loading, signingIn, sessionReady, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
