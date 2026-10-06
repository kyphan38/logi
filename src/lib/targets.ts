// ============================================================
// logi - Week target & debt repository
// EVERY Firestore operation on targets/debt goes through this file.
// Path:
//   users/{uid}/weekTargets/{week}   e.g. "2026-W35"
//   users/{uid}/meta/debt
//   users/{uid}/meta/rollover
//
// Pure logic lives in `rollover.ts`. This file only reads in and writes out.
// ============================================================

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { logicalWeek } from '@/lib/balance';
import { db } from '@/lib/firebase-client';
import {
  buildWeekly,
  planRollover,
  reapplyDebt,
  roundToBudget,
  weeksToRead,
  type DebtBalance,
  type RolloverPlan,
  type Weekly,
} from '@/lib/rollover';
import {
  TargetError,
  WEEK_CLOSED,
  assertOpen,
  assertValid,
} from '@/lib/target-rules';
import { addWeeks, isLateChange, isWeekClosed } from '@/lib/week';
import {
  CATEGORIES,
  PRESETS,
  type DebtLedger,
  type PresetId,
  type WeekTarget,
} from '@/types/logi';


// ------------------------------------------------------------
// Ref & mapping
// ------------------------------------------------------------

const weekCol = (uid: string) => collection(db, 'users', uid, 'weekTargets');
const weekRef = (uid: string, week: string) => doc(db, 'users', uid, 'weekTargets', week);
const debtRef = (uid: string) => doc(db, 'users', uid, 'meta', 'debt');
const rolloverRef = (uid: string) => doc(db, 'users', uid, 'meta', 'rollover');

/**
 * The "reviewed this week" flag: `{ "2026-W35": <epoch> }`.
 *
 * Kept separate from `weekTargets/{week}` because the rules block updates when
 * `lockedAt != null` - the week locks at 21:00 Sunday, while review opens at
 * 19:00 Sunday and stays open until the end of Tuesday. Sharing the doc loses
 * the flag exactly when it matters most.
 */
const reviewsRef = (uid: string) => doc(db, 'users', uid, 'meta', 'reviews');

function toWeekly(d: DocumentData | undefined): Weekly {
  const out = {} as Weekly;
  for (const c of CATEGORIES) out[c] = typeof d?.[c] === 'number' ? (d[c] as number) : 0;
  return out;
}

function toDebt(d: DocumentData | undefined): DebtBalance {
  const out: DebtBalance = {};
  for (const c of CATEGORIES) {
    const v = d?.[c];
    if (typeof v === 'number' && v > 0) out[c] = v;
  }
  return out;
}

function toWeekTarget(week: string, d: DocumentData): WeekTarget {
  return {
    week: (d.week as string) ?? week,
    preset: (d.preset as PresetId) ?? 'normal',
    weekly: toWeekly(d.weekly as DocumentData | undefined),
    debtApplied: toDebt(d.debtApplied as DocumentData | undefined),
    changedAt: (d.changedAt as number) ?? 0,
    lateChange: d.lateChange === true,
    lockedAt: (d.lockedAt as number | null) ?? null,
  };
}

function seedDoc(wt: WeekTarget): DocumentData {
  return {
    week: wt.week,
    preset: wt.preset,
    weekly: wt.weekly,
    debtApplied: wt.debtApplied,
    changedAt: wt.changedAt,
    lateChange: wt.lateChange,
    lockedAt: wt.lockedAt,
  };
}

// ------------------------------------------------------------
// Read
// ------------------------------------------------------------

export async function getWeekTarget(uid: string, week: string): Promise<WeekTarget | null> {
  const snap = await getDoc(weekRef(uid, week));
  return snap.exists() ? toWeekTarget(week, snap.data()) : null;
}

export async function getDebt(uid: string): Promise<DebtLedger> {
  const snap = await getDoc(debtRef(uid));
  const d = snap.data();
  return { balance: toDebt(d?.balance as DocumentData | undefined), updatedAt: d?.updatedAt ?? 0 };
}

/**
 * Targets of several consecutive weeks, for Analytics (Stage 5).
 *
 * The doc id is the week ("2026-W35"), and string order matches time order,
 * even across years ("2025-W52" < "2026-W01"). So one range query on
 * documentId() is enough - no `in`, no 30-item limit.
 *
 * Weeks without a doc are absent from the Map; callers fall back to PRESETS.normal.
 */
export async function listWeekTargets(
  uid: string,
  weeks: string[]
): Promise<Map<string, WeekTarget>> {
  const out = new Map<string, WeekTarget>();
  if (weeks.length === 0) return out;

  const sorted = [...weeks].sort();
  const q = query(
    weekCol(uid),
    where(documentId(), '>=', sorted[0]),
    where(documentId(), '<=', sorted[sorted.length - 1]),
    orderBy(documentId())
  );
  const snap = await getDocs(q);
  const want = new Set(weeks);
  for (const d of snap.docs) {
    if (want.has(d.id)) out.set(d.id, toWeekTarget(d.id, d.data()));
  }
  return out;
}

/** The last N weeks, ascending - `crunchStreak()` reads from the end. */
export async function listRecentWeekTargets(uid: string, n = 6): Promise<WeekTarget[]> {
  const q = query(weekCol(uid), orderBy('week', 'desc'), fsLimit(n));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toWeekTarget(d.id, d.data())).reverse();
}

export function subscribeWeekTarget(
  uid: string,
  week: string,
  cb: (wt: WeekTarget | null) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    weekRef(uid, week),
    (snap) => cb(snap.exists() ? toWeekTarget(week, snap.data()) : null),
    (e) => onError?.(e)
  );
}

/**
 * Listens to targets of several consecutive weeks in realtime (for Analytics).
 */
export function subscribeWeekTargets(
  uid: string,
  weeks: string[],
  cb: (map: Map<string, WeekTarget>) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  if (weeks.length === 0) {
    cb(new Map());
    return () => {};
  }

  const sorted = [...weeks].sort();
  const q = query(
    weekCol(uid),
    where(documentId(), '>=', sorted[0]),
    where(documentId(), '<=', sorted[sorted.length - 1]),
    orderBy(documentId())
  );
  const want = new Set(weeks);
  return onSnapshot(
    q,
    (snap) => {
      const out = new Map<string, WeekTarget>();
      for (const d of snap.docs) {
        if (want.has(d.id)) out.set(d.id, toWeekTarget(d.id, d.data()));
      }
      cb(out);
    },
    (e) => onError?.(e)
  );
}

export function subscribeDebt(
  uid: string,
  cb: (debt: DebtBalance) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    debtRef(uid),
    (snap) => cb(toDebt(snap.data()?.balance as DocumentData | undefined)),
    (e) => onError?.(e)
  );
}

// ------------------------------------------------------------
// Ghi
// ------------------------------------------------------------

/**
 * Creates the week's target if missing. Runs in a transaction because it
 * spends debt: two tabs on Targets without a transaction would spend it twice.
 */
export async function ensureWeekTarget(uid: string, week: string): Promise<WeekTarget> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(weekRef(uid, week));
    if (snap.exists()) return toWeekTarget(week, snap.data());

    const debtSnap = await tx.get(debtRef(uid));
    const debt = toDebt(debtSnap.data()?.balance as DocumentData | undefined);

    const now = Date.now();
    const { weekly, applied, remaining } = buildWeekly(PRESETS.normal.weekly, debt);
    const wt: WeekTarget = {
      week,
      preset: 'normal',
      weekly,
      debtApplied: applied,
      changedAt: now,
      lateChange: false,
      lockedAt: null,
    };

    tx.set(weekRef(uid, week), seedDoc(wt));
    if (Object.keys(applied).length > 0) {
      tx.set(debtRef(uid), { balance: remaining, updatedAt: now });
    }
    return wt;
  });
}


/**
 * Changes the preset. This week's debt was spent once when the doc was created,
 * so here only the recorded `debtApplied` is added back - nothing more from
 * `meta/debt`. Otherwise five preset changes make the debt evaporate.
 */
export async function setPreset(
  uid: string,
  week: string,
  presetId: PresetId,
  now: number = Date.now()
): Promise<void> {
  const current = await getWeekTarget(uid, week);
  assertOpen(current, week, now);

  const debtApplied = current?.debtApplied ?? {};
  const weekly = reapplyDebt(PRESETS[presetId].weekly, debtApplied);
  assertValid(weekly);

  if (!current) {
    await setDoc(weekRef(uid, week), {
      week,
      preset: presetId,
      weekly,
      debtApplied,
      changedAt: now,
      lateChange: isLateChange(now),
      lockedAt: null,
    });
    return;
  }
  await updateDoc(weekRef(uid, week), {
    preset: presetId,
    weekly,
    changedAt: now,
    lateChange: current.lateChange || isLateChange(now),
  });
}

/** Saves a custom target. The slider already called `rebalance()`, so the total must be exactly 89h. */
export async function setCustomTargets(
  uid: string,
  week: string,
  weekly: Weekly,
  now: number = Date.now()
): Promise<void> {
  const current = await getWeekTarget(uid, week);
  assertOpen(current, week, now);

  const settled = roundToBudget(weekly);
  assertValid(settled);

  if (!current) {
    await setDoc(weekRef(uid, week), {
      week,
      preset: 'normal',
      weekly: settled,
      debtApplied: {},
      changedAt: now,
      lateChange: isLateChange(now),
      lockedAt: null,
    });
    return;
  }
  await updateDoc(weekRef(uid, week), {
    weekly: settled,
    changedAt: now,
    lateChange: current.lateChange || isLateChange(now),
  });
}

/** Closes the week. Already locked → nothing to do; rules block updates when `lockedAt != null`. */
export async function lockWeek(uid: string, week: string, at: number = Date.now()): Promise<void> {
  const current = await getWeekTarget(uid, week);
  if (!current || current.lockedAt !== null) return;
  await updateDoc(weekRef(uid, week), { lockedAt: at });
}

/**
 * Lazy lock: opening the app after 21:00 Sunday closes that week.
 * There is no cron, so this is the only way.
 */
export async function lockIfClosed(
  uid: string,
  week: string,
  now: number = Date.now()
): Promise<boolean> {
  if (!isWeekClosed(week, now)) return false;
  const current = await getWeekTarget(uid, week);
  if (!current || current.lockedAt !== null) return false;
  await updateDoc(weekRef(uid, week), { lockedAt: Math.min(now, Date.now()) });
  return true;
}

/**
 * "Reset baseline" - with crunch in 4 of 6 weeks, crunch is no longer an exception.
 * Sets this week to Crunch and CLEARS the debt that kind of cut created.
 * Does not change `BASELINE_DAILY` in logi.ts.
 */
export async function resetBaseline(
  uid: string,
  week: string,
  now: number = Date.now()
): Promise<void> {
  const crunch = PRESETS.crunch.weekly;

  await runTransaction(db, async (tx) => {
    const wSnap = await tx.get(weekRef(uid, week));
    const dSnap = await tx.get(debtRef(uid));

    if (wSnap.exists() && (wSnap.data().lockedAt ?? null) !== null) {
      throw new TargetError('locked', WEEK_CLOSED);
    }

    // Only forgive debt in categories that Crunch cuts. Other debt still has to be paid.
    const debt = toDebt(dSnap.data()?.balance as DocumentData | undefined);
    const next: DebtBalance = {};
    for (const c of CATEGORIES) {
      const owed = debt[c] ?? 0;
      if (owed > 0 && crunch[c] >= PRESETS.normal.weekly[c]) next[c] = owed;
    }

    const wt: WeekTarget = {
      week,
      preset: 'crunch',
      weekly: roundToBudget({ ...crunch }),
      debtApplied: {},
      changedAt: now,
      lateChange: isLateChange(now),
      lockedAt: null,
    };

    tx.set(weekRef(uid, week), seedDoc(wt));
    tx.set(debtRef(uid), { balance: next, updatedAt: now });
  });
}

// ------------------------------------------------------------
// Rollover
// ------------------------------------------------------------

export interface RolloverResult {
  processed: string[];
  skipped: string[];
  reason: RolloverPlan['reason'];
}

/**
 * Week rollover. Called when Now mounts and when the app returns to the foreground.
 *
 * Everything runs in `runTransaction`: read the marker, read the weeks'
 * targets, read the debt, then write it all at once. You use both a phone and
 * a laptop - without a transaction, opening the app on both around the same
 * time runs rollover twice.
 *
 * Firestore reruns a transaction on contention; the rerun reads the new
 * `lastProcessedWeek`, so the plan is empty. That is the idempotence guard.
 */
export async function runRollover(
  uid: string,
  now: number = Date.now()
): Promise<RolloverResult> {
  const currentWeek = logicalWeek(now);

  return runTransaction(db, async (tx) => {
    // ---- READS (Firestore requires every read before every write) ----
    const rollSnap = await tx.get(rolloverRef(uid));
    const last = (rollSnap.data()?.lastProcessedWeek as string | undefined) ?? null;

    const targets: Record<string, WeekTarget | null> = {};
    for (const w of weeksToRead(currentWeek, last)) {
      const s = await tx.get(weekRef(uid, w));
      targets[w] = s.exists() ? toWeekTarget(w, s.data()) : null;
    }

    const debtSnap = await tx.get(debtRef(uid));
    const debt = toDebt(debtSnap.data()?.balance as DocumentData | undefined);

    // ---- PLAN (pure, testable) ----
    const plan = planRollover({ currentWeek, lastProcessedWeek: last, debt, targets, now });

    // ---- WRITES ----
    for (const w of plan.locks) tx.update(weekRef(uid, w), { lockedAt: now });

    for (const seed of plan.creates) {
      tx.set(
        weekRef(uid, seed.week),
        seedDoc({
          week: seed.week,
          preset: seed.preset,
          weekly: seed.weekly,
          debtApplied: seed.debtApplied,
          changedAt: now,
          lateChange: false,
          lockedAt: null,
        })
      );
    }

    if (plan.debt) tx.set(debtRef(uid), { balance: plan.debt, updatedAt: now });

    if (plan.lastProcessedWeek) {
      tx.set(rolloverRef(uid), { lastProcessedWeek: plan.lastProcessedWeek, updatedAt: now });
    }

    return { processed: plan.processed, skipped: plan.skipped, reason: plan.reason };
  });
}

// ------------------------------------------------------------
// Weekly Review (Stage 6)
// ------------------------------------------------------------

export type ReviewFlags = Record<string, number>;

function toReviews(d: DocumentData | undefined): ReviewFlags {
  const out: ReviewFlags = {};
  for (const [k, v] of Object.entries(d ?? {})) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

export async function getReviews(uid: string): Promise<ReviewFlags> {
  const snap = await getDoc(reviewsRef(uid));
  return toReviews(snap.data());
}

export function subscribeReviews(
  uid: string,
  cb: (flags: ReviewFlags) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    reviewsRef(uid),
    (snap) => cb(toReviews(snap.data())),
    (e) => onError?.(e)
  );
}

/** For the Skip button - only closes the banner, never touches next week's target. */
export async function markReviewed(
  uid: string,
  week: string,
  at: number = Date.now()
): Promise<void> {
  await setDoc(reviewsRef(uid), { [week]: at }, { merge: true });
}

/**
 * Review screen 3: fix the preset for the NEXT week, created before rollover runs.
 *
 * One transaction for all three: write the target, spend debt, mark reviewed.
 * If next week's doc already exists (review run twice, or rollover ran first),
 * do NOT recreate it and do NOT spend debt again - only change the preset on
 * the recorded `debtApplied`, exactly like `setPreset()`. That is the idempotence guard.
 */
export async function setupNextWeek(
  uid: string,
  reviewedWeek: string,
  presetId: PresetId,
  now: number = Date.now()
): Promise<WeekTarget> {
  const week = addWeeks(reviewedWeek, 1);

  return runTransaction(db, async (tx) => {
    // ---- READS ----
    const wSnap = await tx.get(weekRef(uid, week));
    const existing = wSnap.exists() ? toWeekTarget(week, wSnap.data()) : null;
    const debtSnap = existing ? null : await tx.get(debtRef(uid));

    if (existing?.lockedAt != null) throw new TargetError('locked', WEEK_CLOSED);

    // ---- WRITES ----
    let wt: WeekTarget;

    if (existing) {
      // This week's debt was spent when the doc was created. Add back exactly what was recorded.
      const weekly = roundToBudget(reapplyDebt(PRESETS[presetId].weekly, existing.debtApplied));
      assertValid(weekly);
      wt = { ...existing, preset: presetId, weekly, changedAt: now };
      tx.update(weekRef(uid, week), { preset: presetId, weekly, changedAt: now });
    } else {
      const debt = toDebt(debtSnap!.data()?.balance as DocumentData | undefined);
      const { weekly, applied, remaining } = buildWeekly(PRESETS[presetId].weekly, debt);
      assertValid(weekly);

      wt = {
        week,
        preset: presetId,
        weekly,
        debtApplied: applied,
        changedAt: now,
        // Next week has not started - setting it ahead is not a "late change".
        lateChange: false,
        lockedAt: null,
      };
      tx.set(weekRef(uid, week), seedDoc(wt));
      if (Object.keys(applied).length > 0) {
        tx.set(debtRef(uid), { balance: remaining, updatedAt: now });
      }
    }

    tx.set(reviewsRef(uid), { [reviewedWeek]: now }, { merge: true });
    return wt;
  });
}

// ------------------------------------------------------------
// UI helpers
// ------------------------------------------------------------

// Pure rules live in `target-rules.ts` so they can be tested without Firestore.
export { TargetError, WEEK_CLOSED, previewSwitch, totalDebt } from '@/lib/target-rules';

// ------------------------------------------------------------
// Backup (Stage 6 Task 3)
// ------------------------------------------------------------

/** `meta/backup` = { lastExport: <epoch> }. */
const backupRef = (uid: string) => doc(db, 'users', uid, 'meta', 'backup');

export async function getLastExport(uid: string): Promise<number | null> {
  const snap = await getDoc(backupRef(uid));
  const v = snap.data()?.lastExport;
  return typeof v === 'number' ? v : null;
}

/** Written after the file has downloaded, not when the button is tapped. */
export async function markExported(uid: string, at: number = Date.now()): Promise<void> {
  await setDoc(backupRef(uid), { lastExport: at }, { merge: true });
}

/** Every week with a target - for the "All time" export. */
export async function listAllWeekTargets(uid: string): Promise<WeekTarget[]> {
  const snap = await getDocs(query(weekCol(uid), orderBy(documentId())));
  return snap.docs.map((d) => toWeekTarget(d.id, d.data()));
}
