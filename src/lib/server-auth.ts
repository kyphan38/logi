import 'server-only';

import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

export type SessionUser = {
  uid: string;
  email: string;
};

/**
 * Đọc session cookie và trả về user, hoặc null nếu không hợp lệ.
 * Nuốt mọi lỗi - người gọi chỉ cần biết có user hay không.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const raw = store.get(process.env.AUTH_COOKIE_NAME ?? 'logi_session')?.value;
    if (!raw) return null;

    // true = kiểm tra token đã bị thu hồi chưa.
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
 * Dùng trong API route ở các stage sau (nhất là /api/parse ở Stage 3).
 * Không có session hợp lệ → throw.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}
