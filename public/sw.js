/* eslint-disable */
// ---------------------------------------------------------------------------
// logi — Service worker (Stage 6 Task 2)
//
// CHỈ xử lý push. Không cache asset nào: cache là một tầng nữa phải debug, và
// khi nó giữ bản cũ thì lỗi rất khó hiểu. App vẫn tải từ mạng như bình thường.
//
// Cố ý KHÔNG dùng SDK FCM ở đây:
//   - đỡ phải nạp script từ CDN mỗi lần SW khởi động
//   - Cloud Function gửi payload chỉ có `data`, nên trình duyệt không tự hiện
//     thông báo. Nếu gửi kèm `notification`, trình duyệt hiện một cái và code
//     dưới đây hiện thêm một cái nữa — người dùng thấy hai thông báo trùng.
// ---------------------------------------------------------------------------

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Payload lạ thì vẫn hiện một thông báo trống còn hơn im lặng nuốt mất.
  }

  const d = payload.data || payload;
  const title = d.title || 'logi';
  const options = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Cùng một loại nhắc thì thay thế cái cũ, không xếp chồng.
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
      // App đang mở sẵn thì đưa cửa sổ đó lên, đừng mở thêm tab thứ hai.
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
