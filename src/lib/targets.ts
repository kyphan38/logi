// ============================================================
// logi - Week target & debt repository
// MỌI thao tác Firestore với target/nợ đi qua file này.
// Path:
//   users/{uid}/weekTargets/{week}   VD "2026-W35"
//   users/{uid}/meta/debt
//   users/{uid}/meta/rollover
//
// Logic thuần nằm ở `rollover.ts`. File này chỉ đọc vào và ghi ra.
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
 * Cờ "đã review tuần này": `{ "2026-W35": <epoch> }`.
 *
 * Để riêng chứ không nhét vào `weekTargets/{week}` vì rules chặn update khi
 * `lockedAt != null` - mà tuần khoá lúc 21:00 CN, còn review mở từ 19:00 CN
 * và còn hạn tới hết thứ Ba. Nhét chung là mất cờ đúng lúc cần nó nhất.
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
// Đọc
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
 * Target của nhiều tuần liền nhau, cho Analytics (Stage 5).
 *
 * Id của doc chính là tuần ("2026-W35") và sắp xếp chuỗi trùng với thứ tự thời
 * gian, kể cả khi qua năm ("2025-W52" < "2026-W01"). Nên một query khoảng trên
 * documentId() là đủ - không cần `in`, không đụng giới hạn 30 phần tử.
 *
 * Tuần nào chưa có doc thì vắng mặt trong Map; nơi gọi tự lùi về PRESETS.normal.
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

/** N tuần gần nhất, theo thứ tự tăng dần - `crunchStreak()` đọc từ cuối lên. */
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
 * Tạo target cho tuần nếu chưa có. Chạy trong transaction vì nó tiêu nợ:
 * hai tab cùng mở màn hình Targets mà không có transaction là trừ nợ hai lần.
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
 * Đổi preset. Nợ của tuần này đã bị tiêu một lần lúc tạo doc, nên ở đây
 * chỉ cộng lại đúng phần `debtApplied` đã ghi - không tiêu thêm từ `meta/debt`.
 * Không vậy thì đổi preset năm lần là nợ bay hơi.
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

/** Ghi target tự chỉnh. Slider đã gọi `rebalance()` nên tổng phải sẵn đúng 89h. */
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

/** Đóng sổ. Đã khoá rồi thì thôi - rules chặn update khi `lockedAt != null`. */
export async function lockWeek(uid: string, week: string, at: number = Date.now()): Promise<void> {
  const current = await getWeekTarget(uid, week);
  if (!current || current.lockedAt !== null) return;
  await updateDoc(weekRef(uid, week), { lockedAt: at });
}

/**
 * Khoá lười: mở app sau 21:00 CN thì tuần đó đóng sổ.
 * Không có cron nên đây là cách duy nhất.
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
 * "Reset baseline" - 4/6 tuần crunch thì crunch không còn là ngoại lệ.
 * Đặt tuần này thành Crunch và XOÁ phần nợ do chính kiểu cắt đó sinh ra.
 * Không sửa `BASELINE_DAILY` trong logi.ts (Stage 4 chưa làm tới đó).
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

    // Chỉ tha nợ ở category mà Crunch cắt xuống. Nợ khác vẫn phải trả.
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
 * Chuyển tuần. Gọi lúc màn hình Now mount và lúc app quay lại foreground.
 *
 * Toàn bộ chạy trong `runTransaction`: đọc cột mốc, đọc target các tuần, đọc nợ,
 * rồi ghi tất cả cùng lúc. Bạn dùng cả điện thoại lẫn laptop - không có
 * transaction thì mở app trên hai máy gần nhau là chạy rollover hai lần.
 *
 * Firestore tự chạy lại transaction khi có tranh chấp; lần chạy lại đọc được
 * `lastProcessedWeek` mới nên kế hoạch thành rỗng. Đó là chốt chặn idempotent.
 */
export async function runRollover(
  uid: string,
  now: number = Date.now()
): Promise<RolloverResult> {
  const currentWeek = logicalWeek(now);

  return runTransaction(db, async (tx) => {
    // ---- READS (Firestore bắt mọi read đứng trước mọi write) ----
    const rollSnap = await tx.get(rolloverRef(uid));
    const last = (rollSnap.data()?.lastProcessedWeek as string | undefined) ?? null;

    const targets: Record<string, WeekTarget | null> = {};
    for (const w of weeksToRead(currentWeek, last)) {
      const s = await tx.get(weekRef(uid, w));
      targets[w] = s.exists() ? toWeekTarget(w, s.data()) : null;
    }

    const debtSnap = await tx.get(debtRef(uid));
    const debt = toDebt(debtSnap.data()?.balance as DocumentData | undefined);

    // ---- PLAN (thuần, test được) ----
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

/** Dùng cho nút Skip - chỉ đóng banner, không đụng target tuần sau. */
export async function markReviewed(
  uid: string,
  week: string,
  at: number = Date.now()
): Promise<void> {
  await setDoc(reviewsRef(uid), { [week]: at }, { merge: true });
}

/**
 * Màn 3 của review: chốt preset cho tuần KẾ TIẾP, tạo trước khi rollover chạy.
 *
 * Một transaction cho cả ba việc: ghi target, trừ nợ, đánh dấu đã review.
 * Nếu doc tuần sau đã tồn tại (chạy review hai lần, hoặc rollover đã chạy trước)
 * thì KHÔNG tạo lại và KHÔNG tiêu nợ lần nữa - chỉ đổi preset trên phần
 * `debtApplied` đã ghi, đúng như `setPreset()` làm. Đó là chốt idempotent.
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
      // Nợ của tuần này đã tiêu lúc tạo doc. Cộng lại đúng phần đã ghi.
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
        // Tuần sau chưa bắt đầu - đặt trước không phải là "sửa muộn".
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
// Tiện ích cho UI
// ------------------------------------------------------------

// Luật thuần sống ở `target-rules.ts` để test được mà không cần Firestore.
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

/** Ghi sau khi file đã tải xong, không phải lúc bấm nút. */
export async function markExported(uid: string, at: number = Date.now()): Promise<void> {
  await setDoc(backupRef(uid), { lastExport: at }, { merge: true });
}

/** Mọi tuần đã có target - cho bản export "All time". */
export async function listAllWeekTargets(uid: string): Promise<WeekTarget[]> {
  const snap = await getDocs(query(weekCol(uid), orderBy(documentId())));
  return snap.docs.map((d) => toWeekTarget(d.id, d.data()));
}
