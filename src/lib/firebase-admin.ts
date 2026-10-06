import 'server-only';

// ============================================================
// logi - Firebase Admin SDK
// SERVER-SIDE only. 'server-only' above keeps this file out of the
// client bundle (the build fails if anyone imports it by mistake).
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
  // The env var stores \n as two literal characters → turn them back into newlines.
  const privateKey = readEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export const adminApp: App = createAdminApp();
export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp, DB_ID);
