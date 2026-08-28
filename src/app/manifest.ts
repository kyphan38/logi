import type { MetadataRoute } from 'next';

// ---------------------------------------------------------------------------
// logi — Web app manifest (Stage 6 Task 2)
//
// `display: standalone` bỏ thanh địa chỉ, được thêm ~15% chiều cao màn hình.
// Trên iOS chỉ Safari mới Add to Home Screen được — Edge không làm được.
// ---------------------------------------------------------------------------

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'logi — time audit',
    short_name: 'logi',
    description: 'Personal time-audit app.',
    start_url: '/now',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // `maskable` để Android tự cắt theo hình dạng của máy, không viền trắng.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
