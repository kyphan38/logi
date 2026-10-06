import type { MetadataRoute } from 'next';

// ---------------------------------------------------------------------------
// logi - Web app manifest (Stage 6 Task 2)
//
// `display: standalone` drops the address bar, gaining ~15% of screen height.
// On iOS only Safari can Add to Home Screen - Edge cannot.
// ---------------------------------------------------------------------------

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'logi - time audit',
    short_name: 'logi',
    description: 'Personal time-audit app.',
    start_url: '/now',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fafafa',
    theme_color: '#fafafa',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // `maskable` lets Android crop to the device's shape, no white border.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
