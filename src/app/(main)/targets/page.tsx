'use client';

// ============================================================
// logi — Màn hình Targets (Stage 4, Task 3)
//
// Ngân sách zero-sum: một tuần có đúng 135.5h. Không thêm được giờ,
// chỉ đổi chỗ. Mọi thứ trên màn hình này phải làm điều đó hiện rõ.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import Toasts from '@/components/Toasts';
import WeeklyReview from '@/components/WeeklyReview';
import { useAuth } from '@/contexts/AuthContext';
import { useTick, useToasts } from '@/hooks/useActivities';
import {
  useCrunchStreak,
  useCurrentWeek,
  useDebt,
  useRollover,
  useWeekTarget,
} from '@/hooks/useTargets';
import { budgetMessages, PRESET_HINT } from '@/lib/copy';
import { rebalance, validateTargets } from '@/lib/balance';
import { roundToBudget, type Weekly } from '@/lib/rollover';
import {
  TargetError,
  previewSwitch,
  resetBaseline,
  setCustomTargets,
  setPreset,
} from '@/lib/targets';
import { isWeekClosed, weekLabel } from '@/lib/week';
import {
  CATEGORIES,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  HARD_FLOOR,
  PRESETS,
  TOTAL_BUDGET,
  type Category,
  type PresetId,
  type WeekTarget,
} from '@/types/logi';

const PRESET_ORDER: PresetId[] = ['normal', 'crunch', 'deep_learn', 'recovery'];
const SHORT: Record<Category, string> = {
  sleep: 'S',
  work: 'W',
  learn: 'L',
  fitness: 'F',
  leisure: 'Le',
};

const h = (n: number) => `${Math.round(n * 10) / 10}h`;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Sleep cố định ở mọi preset, nên nó không bao giờ là slider. */
const ADJUSTABLE = CATEGORIES.filter((c) => c !== 'sleep');

function summary(weekly: Weekly): string {
  return ADJUSTABLE.map((c) => `${SHORT[c]}${Math.round(weekly[c])}`).join(' · ');
}

export default function TargetsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const week = useCurrentWeek();

  // Vào thẳng tab này lúc sáng thứ Hai cũng phải chuyển tuần được.
  useRollover();

  const { target, loading } = useWeekTarget(week);
  const { balance: debt, total: debtTotal, crunchLocked } = useDebt();
  const { streak } = useCrunchStreak(target?.preset ?? null);
  const { toasts, push, dismiss } = useToasts();

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<PresetId | null>(null);
  const [draft, setDraft] = useState<Weekly | null>(null);
  const [keepStreak, setKeepStreak] = useState(false);
  /** Weekly Review mở tay từ đây, không cần đợi tối Chủ nhật. */
  const [reviewOpen, setReviewOpen] = useState<string | null>(null);

  // Từ 21:00 CN tới 04:00 T2, tuần vẫn là "tuần này" nhưng đã đóng sổ.
  // Khoá lười có thể chưa kịp ghi `lockedAt`, nên UI tự kiểm mốc thời gian.
  const nowMinute = useTick(60_000, true);
  const locked = target?.lockedAt != null || isWeekClosed(week, nowMinute);
  const saved: Weekly | null = target?.weekly ?? null;
  const weekly = draft ?? saved;

  const check = useMemo(
    () => (weekly ? validateTargets(weekly) : null),
    [weekly]
  );
  const dirty = draft !== null && saved !== null && ADJUSTABLE.some((c) => draft[c] !== saved[c]);

  // --- Hành động ---------------------------------------------------

  const guard = useCallback(
    async (fn: () => Promise<void>) => {
      if (!uid || busy) return;
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        // Tuần đóng sổ là chuyện thường, không phải lỗi hệ thống.
        push(e instanceof TargetError ? e.message : `Could not save. ${msg(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [uid, busy, push]
  );

  const applyPreset = (id: PresetId) =>
    guard(async () => {
      await setPreset(uid!, week, id);
      setDraft(null);
      setConfirm(null);
      push(`Switched to ${PRESETS[id].label}.`);
    });

  const saveCustom = () =>
    guard(async () => {
      await setCustomTargets(uid!, week, draft!);
      setDraft(null);
      push('Targets saved.');
    });

  const doResetBaseline = () =>
    guard(async () => {
      await resetBaseline(uid!, week);
      setDraft(null);
      push('Baseline reset to Crunch. Matching debt cleared.');
    });

  const drag = (c: Category, value: number) => {
    if (!weekly || locked) return;
    setDraft(roundToBudget(rebalance(weekly, c, value)));
  };

  // --- Render ------------------------------------------------------

  if (!uid) return null;

  return (
    <div className="pb-8">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Targets</h1>
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={() => setReviewOpen(week)}
            className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98]"
          >
            Review
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{weekLabel(week)}</span>
        </div>
      </header>

      {reviewOpen && <WeeklyReview week={reviewOpen} onClose={() => setReviewOpen(null)} />}

      {locked && (
        <p className="mb-4 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          This week is closed.
        </p>
      )}

      {loading && !target ? (
        <p className="py-10 text-center text-sm text-zinc-400">Loading…</p>
      ) : (
        <>
          {streak.shouldPrompt && !keepStreak && !locked && (
            <StreakPrompt
              count={streak.count}
              of={streak.of}
              busy={busy}
              onReset={doResetBaseline}
              onKeep={() => setKeepStreak(true)}
            />
          )}

          <section className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Preset
            </h2>
            <div className="flex flex-col gap-2">
              {PRESET_ORDER.map((id) => (
                <PresetCard
                  key={id}
                  id={id}
                  selected={target?.preset === id && !dirty}
                  // Nợ quá 20h thì không được vay thêm nữa.
                  lockedReason={
                    id === 'crunch' && crunchLocked
                      ? `Locked — ${h(debtTotal)} of debt outstanding`
                      : null
                  }
                  disabled={locked || busy}
                  onSelect={() => setConfirm(id)}
                />
              ))}
            </div>
          </section>

          {weekly && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Custom
              </h2>

              <div className="mb-3 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                <span className="text-zinc-600 dark:text-zinc-400">Sleep</span>
                <span className="font-medium text-zinc-500">{h(weekly.sleep)} — fixed</span>
              </div>

              {ADJUSTABLE.map((c) => (
                <Slider
                  key={c}
                  category={c}
                  value={weekly[c]}
                  disabled={locked || busy}
                  onChange={(v) => drag(c, v)}
                />
              ))}

              <TotalRow weekly={weekly} errors={budgetMessages(weekly)} />

              {dirty && !locked && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCustom}
                    disabled={busy || !check?.ok}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              )}
            </section>
          )}

          <DebtSection debt={debt} applied={target?.debtApplied ?? {}} />
        </>
      )}

      {confirm && weekly && (
        <ConfirmSheet
          to={confirm}
          from={weekly}
          target={target}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => applyPreset(confirm)}
        />
      )}

      {/* Settings không có trong thanh điều hướng: mỗi tuần mới vào một lần. */}
      <Link href="/settings" className="mt-2 self-start text-[13px] text-ink-muted underline">
        Settings
      </Link>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ------------------------------------------------------------
// Preset card
// ------------------------------------------------------------

function PresetCard({
  id,
  selected,
  lockedReason,
  disabled,
  onSelect,
}: {
  id: PresetId;
  selected: boolean;
  lockedReason: string | null;
  disabled: boolean;
  onSelect: () => void;
}) {
  const p = PRESETS[id];
  const off = disabled || lockedReason !== null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={off}
      aria-pressed={selected}
      className={[
        'w-full rounded-md border px-4 py-3 text-left transition',
        selected
          ? 'border-blue-600 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30'
          : 'border-zinc-200 dark:border-zinc-800',
        off ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.99]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.label}</span>
        {selected && <span className="text-blue-600 dark:text-blue-400">✓</span>}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {lockedReason ?? PRESET_HINT[id]}
      </p>
      <p className="mt-1 font-mono text-xs text-zinc-400">{summary(p.weekly)}</p>
    </button>
  );
}

// ------------------------------------------------------------
// Slider
// ------------------------------------------------------------

function Slider({
  category,
  value,
  disabled,
  onChange,
}: {
  category: Category;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const floor = HARD_FLOOR[category] ?? 0;
  // Chạm sàn thì báo rõ, và `min` chặn luôn — không kéo xuống được nữa.
  const atFloor = value <= floor + 0.05 && floor > 0;
  const max = 70;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: CATEGORY_COLOR[category] }}
          />
          {CATEGORY_LABEL[category]}
          {atFloor && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              floor
            </span>
          )}
        </span>
        <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{h(value)}</span>
      </div>
      <input
        type="range"
        min={floor}
        max={max}
        step={0.5}
        value={value}
        disabled={disabled}
        aria-label={CATEGORY_LABEL[category]}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          'h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50',
          atFloor ? 'bg-rose-200 dark:bg-rose-900/60' : 'bg-zinc-200 dark:bg-zinc-800',
        ].join(' ')}
      />
    </div>
  );
}

function TotalRow({ weekly, errors }: { weekly: Weekly; errors: string[] }) {
  const total = CATEGORIES.reduce((a, c) => a + weekly[c], 0);
  const ok = errors.length === 0;

  return (
    <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500">Total</span>
        <span
          className={[
            'font-mono tabular-nums',
            ok ? 'text-zinc-900 dark:text-zinc-100' : 'text-amber-600 dark:text-amber-400',
          ].join(' ')}
        >
          {Math.round(total * 10) / 10} / {TOTAL_BUDGET}h {ok ? '✓' : ''}
        </span>
      </div>
      {errors.map((e) => (
        <p key={e} className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {e}
        </p>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Nợ
// ------------------------------------------------------------

function DebtSection({
  debt,
  applied,
}: {
  debt: Partial<Record<Category, number>>;
  applied: Partial<Record<Category, number>>;
}) {
  const rows = CATEGORIES.filter((c) => (debt[c] ?? 0) > 0 || (applied[c] ?? 0) > 0);
  if (rows.length === 0) return null; // Không nợ ai thì không cần mục này.

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Debt</h2>
      <div className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        {rows.map((c) => (
          <div key={c} className="flex items-baseline justify-between py-1 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">{CATEGORY_LABEL[c]}</span>
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {h(debt[c] ?? 0)}
              {(applied[c] ?? 0) > 0 && (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  ({h(applied[c]!)} applied this week)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------
// Streak
// ------------------------------------------------------------

function StreakPrompt({
  count,
  of,
  busy,
  onReset,
  onKeep,
}: {
  count: number;
  of: number;
  busy: boolean;
  onReset: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Crunch: {count} of the last {of} weeks.
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        Reset your baseline, or is this something to fix?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Reset baseline
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="flex-1 rounded-lg border border-amber-400 py-2 text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          Keep as is
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Confirm sheet
// ------------------------------------------------------------

function ConfirmSheet({
  to,
  from,
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  to: PresetId;
  from: Weekly;
  target: WeekTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rows = previewSwitch(from, to, target?.debtApplied ?? {}).filter(
    (r) => r.category !== 'sleep' && Math.abs(r.to - r.from) > 0.05
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="w-full max-w-lg rounded-t-lg bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-zinc-950 md:rounded-lg md:pb-5">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Switch to {PRESETS[to].label}
        </h3>

        <div className="mb-4">
          {rows.map((r) => (
            <div key={r.category} className="flex items-baseline justify-between py-1 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {CATEGORY_LABEL[r.category]}
              </span>
              <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {h(r.from)} → {h(r.to)}
                {/* Đổi preset mà không thấy giá phải trả thì cơ chế này vô nghĩa. */}
                {r.debt > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    +{h(r.debt)} debt
                  </span>
                )}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-zinc-500">No change to your targets.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Switch
          </button>
        </div>
      </div>
    </div>
  );
}
