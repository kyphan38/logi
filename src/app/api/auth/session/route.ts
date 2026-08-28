import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/server-auth';

// Session cookie sống 14 ngày. KHÔNG lưu thẳng ID token (hết hạn sau 1 giờ).
const MAX_AGE_SECONDS = Number(process.env.AUTH_COOKIE_MAX_AGE_SECONDS ?? 1209600);
const EXPIRES_IN_MS = MAX_AGE_SECONDS * 1000;

function cookieName(): string {
  return process.env.AUTH_COOKIE_NAME ?? 'logi_session';
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// GET - client hỏi: server có coi mình là đã đăng nhập không?
// Dùng để làm mới cookie khi nó hết hạn mà client vẫn còn user.
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ authenticated: user !== null });
}

// POST - đổi ID token lấy session cookie
export async function POST(req: NextRequest) {
  let idToken: unknown;
  try {
    const body = await req.json();
    idToken = body?.idToken;
  } catch {
    return fail('Invalid request body.', 400);
  }

  if (typeof idToken !== 'string' || idToken.length === 0) {
    return fail('Missing idToken.', 400);
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return fail('Invalid or expired sign-in token.', 401);
  }

  // Lớp bảo vệ chính của app một-người-dùng.
  const allowed = process.env.ALLOWED_USER_EMAIL;
  if (!allowed) {
    return fail('Server is misconfigured: ALLOWED_USER_EMAIL is not set.', 500);
  }
  if (decoded.email?.toLowerCase() !== allowed.toLowerCase()) {
    return fail('This account is not authorized.', 403);
  }

  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: EXPIRES_IN_MS,
    });
  } catch {
    return fail('Could not create a session. Please sign in again.', 401);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName(),
    value: sessionCookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}

// DELETE - đăng xuất
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName(),
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
