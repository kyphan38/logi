'use client';

// ============================================================
// logi - Targets screen (Stage 4, Task 3)
//
// Zero-sum budget: a week has exactly 89h. Hours cannot be added, only moved.
// Everything on this screen must make that obvious.
// ============================================================

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import Toasts from '@/components/Toasts';
import RoutineSection from '@/components/RoutineSection';
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
import { dragBounds, MAX_PINNED, rebalance, validateTargets } from '@/lib/balance';
import { reapplyDebt, roundToBudget, type Weekly } from '@/lib/rollover';
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

/**
 * Custom is the FIFTH MODE, not a separate block underneath.
 *
 * Four presets used to sit in a dropdown while four sliders always showed
 * below under "CUSTOM". The screen said two opposite things at once:
 * "Mode: Recovery" above, "Custom 43.5h" below. Now there is ONE list of five
 * choices, and only the selected mode shows its controls.
 */
type ModeId = PresetId | 'custom';
const MODE_ORDER: ModeId[] = [...PRESET_ORDER, 'custom'];
const SHORT: Record<Category, string> = {
  work: 'W',
  learn: 'L',
  fitness: 'F',
  leisure: 'Le',
};

const h = (n: number) => `${Math.round(n * 10) / 10}h`;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * With Sleep gone, NO category is fixed: all 4 can be dragged
 * (AMENDMENT-remove-sleep section 11). The name `ADJUSTABLE` stays to avoid
 * touching every caller, but it now equals `CATEGORIES`.
 */
const ADJUSTABLE = CATEGORIES;

function summary(weekly: Weekly): string {
  return ADJUSTABLE.map((c) => `${SHORT[c]}${Math.round(weekly[c])}`).join(' · ');
}

/**
 * `useSearchParams` forces the subtree to render on the client, so wrap it in
 * Suspense - Next requires this for a static build, it is not for looks.
 */
export default function TargetsPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-zinc-400">Loading…</p>}>
      <TargetsView />
    </Suspense>
  );
}

function TargetsView() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const week = useCurrentWeek();

  // Opening this tab first on Monday morning must still roll the week over.
  useRollover();

  const { target, loading } = useWeekTarget(week);
  const { balance: debt, total: debtTotal, crunchLocked } = useDebt();
  const { streak } = useCrunchStreak(target?.preset ?? null);
  const { toasts, push, dismiss } = useToasts();

  // `/targets?suggest=crunch` - Stage 7 only HIGHLIGHTS the card, never applies it.
  // The user still taps and confirms, like any other preset change.
  const params = useSearchParams();
  const raw = params.get('suggest');
  const suggested: PresetId | null =
    raw !== null && (PRESET_ORDER as readonly string[]).includes(raw) ? (raw as PresetId) : null;

  /** There is a suggestion, and it differs from the current preset → something to do. */
  const suggestPending = suggested !== null && suggested !== target?.preset;

  const [busy, setBusy] = useState(false);
  // The mode list is collapsed by default. It opens when arriving via `?suggest=` -
  // a deep link that lands on a closed block leads nowhere.
  const [modeOpen, setModeOpen] = useState(suggested !== null);
  const [confirm, setConfirm] = useState<PresetId | null>(null);
  const [draft, setDraft] = useState<Weekly | null>(null);
  /** The user just picked Custom, even if the saved numbers still equal the preset. */
  const [customPicked, setCustomPicked] = useState(false);
  /**
   * Pinned categories: dragging another one must NOT take their hours.
   * Session only - this is how you are dragging, not a weekly goal.
   */
  const [pinned, setPinned] = useState<Set<Category>>(() => new Set());
  const [keepStreak, setKeepStreak] = useState(false);
  /** Weekly Review opened by hand from here, no need to wait for Sunday evening. */
  const [reviewOpen, setReviewOpen] = useState<string | null>(null);

  // From 21:00 Sunday to 04:00 Monday the week is still "this week" but closed.
  // The lazy lock may not have written `lockedAt` yet, so the UI checks the time itself.
  const nowMinute = useTick(60_000, true);
  const locked = target?.lockedAt != null || isWeekClosed(week, nowMinute);
  const saved: Weekly | null = target?.weekly ?? null;
  const weekly = draft ?? saved;

  const check = useMemo(
    () => (weekly ? validateTargets(weekly) : null),
    [weekly]
  );
  const dirty = draft !== null && saved !== null && ADJUSTABLE.some((c) => draft[c] !== saved[c]);

  // Saved numbers DIFFER from the preset in the doc → this week is really Custom.
  // Without this the screen keeps saying "Recovery" after you dragged 20h away,
  // and the mode becomes a lying label.
  const savedIsCustom = useMemo(() => {
    if (!saved || !target) return false;
    const base = reapplyDebt(PRESETS[target.preset].weekly, target.debtApplied ?? {});
    return ADJUSTABLE.some((c) => Math.abs(saved[c] - base[c]) > 0.05);
  }, [saved, target]);

  const mode: ModeId =
    dirty || customPicked || savedIsCustom ? 'custom' : (target?.preset ?? 'normal');

  // --- Actions -----------------------------------------------------

  const guard = useCallback(
    async (fn: () => Promise<void>) => {
      if (!uid || busy) return;
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        // A closed week is normal, not a system error.
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
      setCustomPicked(false);
      setPinned(new Set());
      push(`Switched to ${PRESETS[id].label}.`);
    });

  /** Picking Custom = keep the current hours and open the sliders. Nothing saved yet. */
  const pickCustom = () => {
    setCustomPicked(true);
    setConfirm(null);
    setModeOpen(false);
  };

  const cancelCustom = () => {
    setDraft(null);
    setPinned(new Set());
    if (!savedIsCustom) setCustomPicked(false);
  };

  /** Pin / unpin. Beyond 3 the request is silently refused - the button is disabled. */
  const togglePin = (c: Category) =>
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else if (next.size < MAX_PINNED) next.add(c);
      return next;
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
    setDraft(roundToBudget(rebalance(weekly, c, value, pinned)));
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

          {/*
            Four preset cards took most of the screen for something changed every
            few weeks. Folded into one "Mode · Normal" row; opens when needed.
          */}
          <section className="mb-6">
            <button
              type="button"
              onClick={() => setModeOpen((v) => !v)}
              aria-expanded={modeOpen}
              className="flex w-full items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-left transition active:scale-[0.99] dark:border-zinc-800"
            >
              <span className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Mode
                </span>
                <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {mode === 'custom' ? 'Custom' : PRESETS[mode].label}
                </span>
                {suggestPending && (
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    · Suggested: {PRESETS[suggested!].label}
                  </span>
                )}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-zinc-400 transition ${modeOpen ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {modeOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {MODE_ORDER.map((id) =>
                  id === 'custom' ? (
                    <ModeCard
                      key={id}
                      label="Custom"
                      hint="Your own hours"
                      summary={weekly ? summary(weekly) : ''}
                      selected={mode === 'custom'}
                      disabled={locked || busy}
                      onSelect={pickCustom}
                    />
                  ) : (
                    <ModeCard
                      key={id}
                      label={PRESETS[id].label}
                      hint={PRESET_HINT[id]}
                      summary={summary(PRESETS[id].weekly)}
                      selected={mode === id}
                      suggested={suggested === id && mode !== id}
                      // Over 20h of debt, no more borrowing.
                      lockedReason={
                        id === 'crunch' && crunchLocked
                          ? `Locked - ${h(debtTotal)} of debt outstanding`
                          : null
                      }
                      disabled={locked || busy}
                      onSelect={() => setConfirm(id)}
                    />
                  )
                )}
              </div>
            )}
          </section>

          {/*
            Sliders ONLY show in Custom mode. Seeing four sliders in Recovery
            invites you to break the preset you just picked.
          */}
          {weekly && mode === 'custom' && (
            <section className="mb-6">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Your hours
                </h2>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {pinned.size > 0
                    ? `${pinned.size}/${MAX_PINNED} pinned`
                    : 'Pin one to hold it steady'}
                </span>
              </div>

              {ADJUSTABLE.map((c) => {
                const isPinned = pinned.has(c);
                // The other 3 pinned → this one is the rest of 89h; dragging it
                // could not be balanced. Readable, not draggable.
                const derived = !isPinned && pinned.size >= MAX_PINNED;
                const bounds = dragBounds(weekly, c, pinned);
                return (
                  <Slider
                    key={c}
                    category={c}
                    value={weekly[c]}
                    min={bounds.min}
                    max={bounds.max}
                    pinned={isPinned}
                    derived={derived}
                    canPin={isPinned || pinned.size < MAX_PINNED}
                    onTogglePin={() => togglePin(c)}
                    disabled={locked || busy || isPinned || derived}
                    onChange={(v) => drag(c, v)}
                  />
                );
              })}

              <TotalRow weekly={weekly} errors={budgetMessages(weekly)} />

              {dirty && !locked && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={cancelCustom}
                    className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCustom}
                    disabled={busy || !check?.ok}
                    className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              )}
            </section>
          )}

          <DebtSection debt={debt} applied={target?.debtApplied ?? {}} />

          {/* Routine (Stage 10): a checklist repeating by weekday, ticked on Now. */}
          <RoutineSection />
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

      {/* Settings is not in the nav: visited about once a week. */}
      <Link href="/settings" className="mt-2 self-start text-[13px] text-ink-muted underline">
        Settings
      </Link>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ------------------------------------------------------------
// Mode card
// ----------------------------------------------------------------------

function ModeCard({
  label,
  hint,
  summary: line,
  selected,
  suggested = false,
  lockedReason = null,
  disabled,
  onSelect,
}: {
  label: string;
  hint: string;
  summary: string;
  selected: boolean;
  /** Suggested by the AI on Analytics. Only a hint, nothing applied. */
  suggested?: boolean;
  lockedReason?: string | null;
  disabled: boolean;
  onSelect: () => void;
}) {
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
          ? 'border-zinc-900 bg-zinc-100/60 dark:border-zinc-100 dark:bg-zinc-800/40'
          : 'border-zinc-200 dark:border-zinc-800',
        off ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.99]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        {selected ? (
          <span className="text-zinc-900 dark:text-zinc-100">✓</span>
        ) : suggested ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Suggested</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {lockedReason ?? hint}
      </p>
      <p className="mt-1 font-mono text-xs text-zinc-400">{line}</p>
    </button>
  );
}

// ----------------------------------------------------------------------
// Slider
// ------------------------------------------------------------

/** Small lock next to each category. Closed = nobody can take its hours. */
function PinButton({
  pinned,
  canPin,
  disabled,
  label,
  onClick,
}: {
  pinned: boolean;
  canPin: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const off = disabled || (!pinned && !canPin);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      className={[
        'shrink-0 rounded p-1 transition',
        pinned ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-600',
        off ? 'cursor-not-allowed opacity-40' : 'active:scale-90',
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        {pinned ? (
          <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
        ) : (
          <path d="M8 11V7a4 4 0 0 1 7.5-2" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

function Slider({
  category,
  value,
  min,
  max,
  pinned,
  derived,
  canPin,
  disabled,
  onChange,
  onTogglePin,
}: {
  category: Category;
  value: number;
  /** This category's hard floor. */
  min: number;
  /** The REAL cap after pinned hours - not always 70h. */
  max: number;
  pinned: boolean;
  /** The other three are pinned → this number is the rest, read-only. */
  derived: boolean;
  canPin: boolean;
  disabled: boolean;
  onChange: (v: number) => void;
  onTogglePin: () => void;
}) {
  const floor = HARD_FLOOR[category] ?? 0;
  // At the floor, say so clearly, and `min` blocks it - no dragging lower.
  const atFloor = value <= floor + 0.05 && floor > 0;
  // 70h is the slider's limit; `max` is the budget's limit.
  const ceiling = Math.max(min, Math.min(70, max));

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
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              floor
            </span>
          )}
          {derived && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              auto
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
            {h(value)}
          </span>
          <PinButton
            pinned={pinned}
            canPin={canPin}
            disabled={derived}
            label={CATEGORY_LABEL[category]}
            onClick={onTogglePin}
          />
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={ceiling}
        step={0.5}
        value={value}
        disabled={disabled}
        aria-label={CATEGORY_LABEL[category]}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          'h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50',
          atFloor ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-zinc-200 dark:bg-zinc-800',
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
            ok ? 'text-zinc-900 dark:text-zinc-100' : 'font-medium text-zinc-900 dark:text-zinc-100',
          ].join(' ')}
        >
          {Math.round(total * 10) / 10} / {TOTAL_BUDGET}h {ok ? '✓' : ''}
        </span>
      </div>
      {errors.map((e) => (
        <p key={e} className="mt-1 text-xs font-medium text-zinc-900 dark:text-zinc-100">
          {e}
        </p>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Debt
// ------------------------------------------------------------

function DebtSection({
  debt,
  applied,
}: {
  debt: Partial<Record<Category, number>>;
  applied: Partial<Record<Category, number>>;
}) {
  const rows = CATEGORIES.filter((c) => (debt[c] ?? 0) > 0 || (applied[c] ?? 0) > 0);
  if (rows.length === 0) return null; // No debt, no section.

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
    <div className="mb-6 rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Crunch: {count} of the last {of} weeks.
      </p>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        Reset your baseline, or is this something to fix?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Reset baseline
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="flex-1 rounded-lg border border-zinc-400 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
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
    (r) => Math.abs(r.to - r.from) > 0.05
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
                {/* Changing preset without seeing the cost makes this mechanism pointless. */}
                {r.debt > 0 && (
                  <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">
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
            className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40"
          >
            Switch
          </button>
        </div>
      </div>
    </div>
  );
}
