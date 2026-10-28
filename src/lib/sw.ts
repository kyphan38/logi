// Imports nothing, on purpose: the app-shell cache decides how fast the app
// opens and must not wait for the push SDK (src/lib/push.ts).
// Only in a build: in dev, cached HTML would keep showing old code.
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (process.env.NODE_ENV !== 'production') return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // Safari private mode and some other contexts refuse. The app still works.
    return null;
  }
}
