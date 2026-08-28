'use client';

// ---------------------------------------------------------------------------
// logi - Push notification (Stage 6 Task 2)
//
// Nhắc 06:15 / 20:45 / 19:00 CN hiện ở màn khoá, kể cả khi app đã đóng.
// Nhắc trong app của Stage 4 GIỮ NGUYÊN làm dự phòng - push có thể bị chặn,
// hết hạn token, hoặc người dùng chưa cài lên màn hình chính.
//
// Token nằm ở `users/{uid}/meta/fcm`. File này là nơi duy nhất ghi doc đó.
// ---------------------------------------------------------------------------

import { doc, setDoc, deleteField } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

import { app, db } from '@/lib/firebase-client';

const SW_URL = '/sw.js';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * iOS chỉ cho phép push khi app đã được Add to Home Screen và đang chạy
 * standalone. Mở trong tab Safari thì `Notification` có tồn tại nhưng
 * `requestPermission()` sẽ luôn trả về 'denied' - hỏi lúc đó chỉ làm người
 * dùng mất quyền vĩnh viễn, nên phải chặn từ trước.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (!(await isSupported())) return 'unsupported';
  // Safari trên iOS: chưa cài lên màn hình chính thì coi như chưa hỗ trợ.
  if (isIOS() && !isStandalone()) return 'unsupported';
  return Notification.permission as PushState;
}

export class PushError extends Error {}

/**
 * Bật push. PHẢI gọi từ đúng một cú chạm của người dùng: trình duyệt chỉ cho
 * hỏi quyền khi có tương tác, và hỏi sai lúc thì mất luôn cơ hội hỏi lại.
 *
 * Trả về token, hoặc ném lỗi có câu chữ hiển thị được cho người dùng.
 */
export async function enablePush(uid: string): Promise<string> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new PushError('Push is not configured on this build.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushError('Notifications are blocked. Turn them on in your browser settings.');
  }

  // Đăng ký SW của mình rồi đưa cho FCM dùng, thay vì để nó tự tìm
  // `/firebase-messaging-sw.js` - app chỉ có một service worker duy nhất.
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  await navigator.serviceWorker.ready;

  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new PushError('Could not get a push token. Try again.');

  await setDoc(
    doc(db, 'users', uid, 'meta', 'fcm'),
    {
      token,
      platform: isIOS() ? 'ios' : 'other',
      // Token web hết hạn im lặng. Cloud Function xoá token chết, còn mốc này
      // cho biết lần cuối máy này còn nói chuyện được.
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return token;
}

/**
 * Tắt push từ phía app: xoá token nên server không gửi nữa.
 * Quyền của trình duyệt thì chỉ người dùng tự thu hồi trong cài đặt được.
 */
export async function disablePush(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'meta', 'fcm'),
    { token: deleteField(), updatedAt: Date.now() },
    { merge: true }
  );
}
