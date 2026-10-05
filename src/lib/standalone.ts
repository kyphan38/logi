/**
 * true khi app chạy từ màn hình chính (Add to Home Screen), không phải tab
 * trình duyệt. Tách riêng khỏi push.ts để AuthContext dùng được mà không kéo
 * firebase/messaging vào mọi trang.
 *
 * iOS chỉ cho phép push khi app đang chạy standalone. Mở trong tab Safari thì
 * `Notification` có tồn tại nhưng `requestPermission()` sẽ luôn trả về
 * 'denied' - hỏi lúc đó chỉ làm người dùng mất quyền vĩnh viễn.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}
