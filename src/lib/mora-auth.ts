import 'server-only';

// Shared checks for the routes mora's Cloud Functions call (server to server).

import { timingSafeEqual } from 'node:crypto';

import { adminAuth } from '@/lib/firebase-admin';

export function tokenOk(header: string | null, expected: string): boolean {
  const got = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

let cachedUid: string | null = null;
export async function ownerUid(): Promise<string> {
  if (cachedUid) return cachedUid;
  const email = process.env.ALLOWED_USER_EMAIL;
  if (!email) throw new Error('ALLOWED_USER_EMAIL is not set');
  cachedUid = (await adminAuth.getUserByEmail(email)).uid;
  return cachedUid;
}
