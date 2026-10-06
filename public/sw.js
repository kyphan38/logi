/* eslint-disable */
// ---------------------------------------------------------------------------
// logi - Service worker
//
// Handles push ONLY. No asset caching: a cache is one more layer to debug,
// and stale copies cause confusing bugs. The app loads from the network.
//
// The FCM SDK is NOT used here on purpose:
//   - no CDN script load on every SW start
//   - the Cloud Function sends a `data`-only payload, so the browser shows
//     nothing itself. With `notification` too, the browser shows one and the
//     code below shows another: a duplicate.
// ---------------------------------------------------------------------------

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
