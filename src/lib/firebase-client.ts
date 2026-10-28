// ============================================================
// logi - Firebase client SDK (browser)
// Singleton: Next.js hot reload loads the module many times.
// ============================================================

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

import { DB_ID } from '@/lib/db-id';

/**
 * On the real domain, authDomain = the app's own domain (next.config.ts proxies
 * /__/auth/* to firebaseapp.com). With firebaseapp.com, Safari treats it as
 * third-party and blocks storage, so a Home Screen app signs in but never
 * gets the result.
 *
 * localhost and *.vercel.app previews keep firebaseapp.com: those hosts have
 * no redirect URI in the Google OAuth client yet.
 */
function resolveAuthDomain(): string | undefined {
  const fallback = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (typeof window === 'undefined') return fallback;
  const { protocol, host, hostname } = window.location;
  if (protocol !== 'https:' || hostname.endsWith('.vercel.app')) return fallback;
  return host;
}

// Next.js only inlines NEXT_PUBLIC_* vars written out in full, not destructured.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  throw new Error(
    `[firebase-client] Missing env vars for: ${missing.join(', ')}. ` +
      'Check .env.local against .env.example.',
  );
}

export const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig as Required<typeof firebaseConfig>);

/**
 * Auth without a popup/redirect resolver: with one, Safari and iOS load the
 * Google sign-in iframe on every open and wait for it before reporting the
 * signed-in user. Sign-in calls in AuthContext pass the resolver themselves.
 * Persistence is the same list getAuth uses, so existing sessions stay.
 */
function createAuth(): Auth {
  if (typeof window === 'undefined') return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    // Hot reload: auth already exists for this app.
    return getAuth(app);
  }
}

export const auth: Auth = createAuth();

// Firestore may only be initialized once per app. Keep it on globalThis so
// hot reload does not throw "Firestore has already been started".
const globalCache = globalThis as unknown as { __logiDb?: Firestore };

function createDb(): Firestore {
  // Server-side (SSR / build): no IndexedDB, use the default instance.
  // Do NOT cache on globalThis: on the server Next may load firebase/firestore
  // as several module copies, and a shared cache makes collection(db, ...)
  // throw "Expected first argument ... to be FirebaseFirestore".
  // getFirestore(app, DB_ID) is already idempotent, so no cache is needed.
  if (typeof window === 'undefined') return getFirestore(app, DB_ID);

  if (globalCache.__logiDb) return globalCache.__logiDb;

  let db: Firestore;
  try {
    // Offline-first: Start/Stop still work offline and sync later.
    // databaseId is the THIRD argument of initializeFirestore, after settings.
    db = initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      DB_ID,
    );
  } catch (err) {
    // iOS Safari private mode blocks IndexedDB → fall back to a memory cache.
    console.warn('[firebase-client] persistent cache unavailable, using memory cache', err);
    try {
      db = initializeFirestore(app, { localCache: memoryLocalCache() }, DB_ID);
    } catch {
      db = getFirestore(app, DB_ID);
    }
  }

  globalCache.__logiDb = db;
  return db;
}

export const db: Firestore = createDb();
