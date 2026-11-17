'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_SLEEP, type SleepPlan } from '@/lib/sleep-plan';
import { subscribeSleep } from '@/lib/sleep-store';

/** The sleep plan (G10), live. The default (off) until the doc arrives. */
export function useSleepPlan(): SleepPlan {
  const { uid } = useAuth();
  const [plan, setPlan] = useState<SleepPlan>(DEFAULT_SLEEP);
  useEffect(() => (uid ? subscribeSleep(uid, setPlan) : undefined), [uid]);
  return plan;
}
