/**
 * true when the app runs from the Home Screen (Add to Home Screen), not a
 * browser tab. Separate from push.ts so AuthContext can use it without
 * pulling firebase/messaging into every page.
 *
 * iOS only allows push when the app runs standalone. In a Safari tab
 * `Notification` exists, but `requestPermission()` always returns 'denied' -
 * asking then only loses the permission for good.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}
