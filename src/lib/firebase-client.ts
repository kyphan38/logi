// ============================================================
// logi — Firebase client SDK (browser)
// Singleton: Next.js hot reload sẽ nạp lại module nhiều lần.
// ============================================================

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

// Next.js chỉ inline được biến NEXT_PUBLIC_* khi viết đầy đủ, không destructure.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
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

export const auth: Auth = getAuth(app);

// Firestore chỉ được khởi tạo một lần cho mỗi app. Giữ ở globalThis để
// hot reload không ném lỗi "Firestore has already been started".
const globalCache = globalThis as unknown as { __logiDb?: Firestore };

function createDb(): Firestore {
  // Server-side (SSR / build): không có IndexedDB, dùng bản mặc định.
  // KHÔNG cache vào globalThis: trên server Next có thể nạp firebase/firestore
  // thành nhiều bản sao module khác nhau, dùng chung cache sẽ khiến
  // collection(db, ...) ném "Expected first argument ... to be FirebaseFirestore".
  // getFirestore(app) vốn đã idempotent nên không cần cache.
  if (typeof window === 'undefined') return getFirestore(app);

  if (globalCache.__logiDb) return globalCache.__logiDb;

  let db: Firestore;
  try {
    // Offline-first: Start/Stop vẫn chạy khi mất mạng, sync lại sau.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    // iOS Safari private mode chặn IndexedDB → rơi về memory cache.
    console.warn('[firebase-client] persistent cache unavailable, using memory cache', err);
    try {
      db = initializeFirestore(app, { localCache: memoryLocalCache() });
    } catch {
      db = getFirestore(app);
    }
  }

  globalCache.__logiDb = db;
  return db;
}

export const db: Firestore = createDb();
