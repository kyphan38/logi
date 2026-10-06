'use client';

// ---------------------------------------------------------------------------
// logi - Push notifications (Stage 6 Task 2)
//
// Reminders at 06:15 / 20:45 / 19:00 Sun show on the Lock Screen, even with
// the app closed. Stage 4's in-app reminders STAY as a fallback - push may be
// blocked, the token may expire, or the app may not be on the Home Screen.
//
// The token lives at `users/{uid}/meta/fcm`. This file is the only writer of that doc.
// ---------------------------------------------------------------------------

import { doc, setDoc, deleteField } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

import { app, db } from '@/lib/firebase-client';
import { isStandalone } from '@/lib/standalone';

const SW_URL = '/sw.js';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (!(await isSupported())) return 'unsupported';
  // Safari on iOS: not on the Home Screen yet counts as unsupported.
  if (isIOS() && !isStandalone()) return 'unsupported';
  return Notification.permission as PushState;
}

export class PushError extends Error {}

/**
 * Turns push on. MUST be called from a single user tap: browsers only allow a
 * permission prompt on interaction, and asking at the wrong time loses the
 * chance to ask again.
 *
 * Returns the token, or throws with a message fit to show the user.
 */
export async function enablePush(uid: string): Promise<string> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new PushError('Push is not configured on this build.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushError('Notifications are blocked. Turn them on in your browser settings.');
  }

  // Register our own SW and hand it to FCM, instead of letting it look for
  // `/firebase-messaging-sw.js` - the app has a single service worker.
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
      // Web tokens expire silently. The Cloud Function removes dead tokens, and
      // this mark shows when this device last checked in.
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return token;
}

/**
 * Turns push off from the app: deletes the token so the server stops sending.
 * The browser permission can only be revoked by the user in settings.
 */
export async function disablePush(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'meta', 'fcm'),
    { token: deleteField(), updatedAt: Date.now() },
    { merge: true }
  );
}
