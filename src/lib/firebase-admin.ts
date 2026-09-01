import 'server-only';

// ============================================================
// logi - Firebase Admin SDK
// CHỈ chạy server-side. 'server-only' ở trên chặn file này lọt
// vào client bundle (build sẽ fail nếu có ai import nhầm).
// ============================================================

import { cert, getApps, getApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { DB_ID } from '@/lib/db-id';

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[firebase-admin] Missing required environment variable: ${name}. ` +
        'Add it to .env.local (local) or Vercel → Settings → Environment Variables.',
    );
  }
  return value;
}

function createAdminApp(): App {
  if (getApps().length > 0) return getApp();

  const projectId = readEnv('FIREBASE_ADMIN_PROJECT_ID');
  const clientEmail = readEnv('FIREBASE_ADMIN_CLIENT_EMAIL');
  // Env var lưu \n dạng hai ký tự literal → đổi lại thành xuống dòng thật.
  const privateKey = readEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export const adminApp: App = createAdminApp();
export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp, DB_ID);
