'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { EMPTY_PLAN, type DayPlan } from '@/lib/day-plan';
import { subscribeDayPlan } from '@/lib/day-plan-store';

/** The day plan (G1), live. Null until the first read. */
export function useDayPlan(): DayPlan | null {
  const { uid } = useAuth();
  const [plan, setPlan] = useState<DayPlan | null>(null);
  useEffect(() => (uid ? subscribeDayPlan(uid, setPlan) : undefined), [uid]);
  return uid ? plan : EMPTY_PLAN;
}
