// G1: the day plan at users/{uid}/meta/dayPlan.

import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';

import { cleanPlan, type DayPlan } from '@/lib/day-plan';
import { db } from '@/lib/firebase-client';

const planRef = (uid: string) => doc(db, 'users', uid, 'meta', 'dayPlan');

export function subscribeDayPlan(uid: string, cb: (plan: DayPlan) => void): Unsubscribe {
  return onSnapshot(planRef(uid), (snap) => cb(cleanPlan(snap.data())), () => undefined);
}

export function saveDayPlan(uid: string, plan: DayPlan): Promise<void> {
  return setDoc(planRef(uid), { ...cleanPlan(plan), updatedAt: Date.now() });
}
