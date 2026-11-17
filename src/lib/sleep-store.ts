// G10: the sleep plan at users/{uid}/meta/sleep. The push function reads it too.

import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase-client';
import { cleanSleep, type SleepPlan } from '@/lib/sleep-plan';

const sleepRef = (uid: string) => doc(db, 'users', uid, 'meta', 'sleep');

export function subscribeSleep(uid: string, cb: (plan: SleepPlan) => void): Unsubscribe {
  return onSnapshot(sleepRef(uid), (snap) => cb(cleanSleep(snap.data())), () => undefined);
}

export function saveSleep(uid: string, plan: SleepPlan): Promise<void> {
  return setDoc(sleepRef(uid), { ...cleanSleep(plan), updatedAt: Date.now() });
}
