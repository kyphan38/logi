import 'server-only';

import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

export type SessionUser = {
  uid: string;
  email: string;
};

/**
 * Reads the session cookie and returns the user, or null if invalid.
 * Swallows every error - callers only need to know whether there is a user.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const raw = store.get(process.env.AUTH_COOKIE_NAME ?? 'logi_session')?.value;
    if (!raw) return null;

    // true = check whether the token was revoked.
    const decoded = await adminAuth.verifySessionCookie(raw, true);

    const allowed = process.env.ALLOWED_USER_EMAIL;
    const email = decoded.email;
    if (!allowed || !email) return null;
    if (email.toLowerCase() !== allowed.toLowerCase()) return null;

    return { uid: decoded.uid, email };
  } catch {
    return null;
  }
}

/**
 * Used in API routes (mainly /api/parse).
 * No valid session → throw.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
