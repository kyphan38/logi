/* eslint-disable */
// ---------------------------------------------------------------------------
// logi - Service worker
//
// Two jobs: push, and cache the app shell so the app opens without waiting
// for the network.
//
// /_next/static/*  cache-first forever. File names hash their content, so a
//                  new build means new names - never stale.
// HTML             stale-while-revalidate, key = pathname. Pages are static
//                  (auth is checked in the browser), so last build's HTML is
//                  still correct. The new build is fetched in the background,
//                  with its JS/CSS, and shows on the next open.
// API / Firestore  not touched. Data is never served from an old copy.
//
// The FCM SDK is NOT used here on purpose:
//   - no CDN script load on every SW start
//   - the Cloud Function sends a `data`-only payload, so the browser shows
//     nothing itself. With `notification` too, the browser shows one and the
//     code below shows another: a duplicate.
// ---------------------------------------------------------------------------

const CACHE_VERSION = 'logi-v1';

// Every page, so a page never opened before still opens offline. A miss must
// not fall back to another page: signed out and offline, the /login <-> app
// redirect would then loop forever.
const PAGES = ['/now', '/history', '/analytics', '/targets', '/reminders', '/settings', '/settings/restore', '/login'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(
    PAGES.map((path) =>
      fetch(path, { cache: 'no-cache' })
        .then((res) => res.ok && store(cache, path, res))
        .catch(() => {
          // Offline during install: pages fill in as they are opened.
        }),
    ),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isNeverCached(url) {
  return (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/__/')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isNeverCached(url)) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate') {
    const key = url.pathname;
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const hit = await cache.match(key);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) event.waitUntil(store(cache, key, res.clone()));
            return res;
          })
          .catch(() => null);
        if (hit) {
          event.waitUntil(fresh);
          return hit;
        }
        return (await fresh) || Response.error();
      }),
    );
  }
});

// Save the HTML, then fetch the JS/CSS it needs now, so the next open (which
// uses this HTML) does not hit the network or a removed old build file.
async function store(cache, key, res) {
  const html = await res.clone().text();
  await cache.put(key, res);
  const urls = new Set();
  for (const m of html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)/g)) urls.add(m[1]);
  await Promise.all(
    [...urls].map((u) =>
      cache.match(u).then((hit) => hit || fetch(u).then((r) => r.ok && cache.put(u, r)).catch(() => {})),
    ),
  );
}

// --- Push --------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // An odd payload still shows an empty notification rather than being swallowed.
  }

  const d = payload.data || payload;
  const title = d.title || 'logi';
  const options = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Same reminder type replaces the old one instead of stacking.
    tag: d.tag || 'logi',
    renotify: false,
    data: { url: d.url || '/now' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/now';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // If the app is already open, focus that window instead of a second tab.
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      if (list.length > 0 && 'navigate' in list[0]) {
        return list[0].navigate(url).then((c) => c && c.focus());
      }
      return self.clients.openWindow(url);
    })
  );
});
