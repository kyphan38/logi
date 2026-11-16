'use client';

// ============================================================
// logi - Targets screen (Stage 4, Task 3)
//
// Zero-sum budget: a week has exactly 89h. Hours cannot be added, only moved.
// Everything on this screen must make that obvious.
// ============================================================

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import Toasts from '@/components/Toasts';
import RoutineSection from '@/components/RoutineSection';
import WeeklyReview from '@/components/WeeklyReview';
import { useAuth } from '@/contexts/AuthContext';
import { useTargetsDraft } from '@/hooks/useTargetsDraft';
import { useToasts } from '@/hooks/useActivities';
import {
  useCrunchStreak,
  useCurrentWeek,
  useDebt,
  useRollover,
  useWeekTarget,
} from '@/hooks/useTargets';
import { budgetMessages, PRESET_HINT } from '@/lib/copy';
import { dragBounds, MAX_PINNED } from '@/lib/balance';
import { weekLabel } from '@/lib/week';
import { PRESETS, type PresetId } from '@/types/logi';
import { btn, LABEL } from '@/lib/ui';
import { ADJUSTABLE, MODE_ORDER, PRESET_ORDER, h, summary } from '@/lib/targets-view';
import ModeCard from '@/components/targets/ModeCard';
import Slider from '@/components/targets/Slider';
import TotalRow from '@/components/targets/TotalRow';
import DebtSection from '@/components/targets/DebtSection';
import StreakPrompt from '@/components/targets/StreakPrompt';
import ConfirmSheet from '@/components/targets/ConfirmSheet';

/**
 * `useSearchParams` forces the subtree to render on the client, so wrap it in
 * Suspense - Next requires this for a static build, it is not for looks.
 */
export default function TargetsPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-ink-muted">Loading…</p>}>
      <TargetsView />
    </Suspense>
  );
}

function TargetsView() {
  const { uid } = useAuth();
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

  const {
    busy,
    modeOpen,
    setModeOpen,
    confirm,
    setConfirm,
    pinned,
    keepStreak,
    setKeepStreak,
    reviewOpen,
    setReviewOpen,
    locked,
    weekly,
    check,
    dirty,
    mode,
    applyPreset,
    pickCustom,
    cancelCustom,
    togglePin,
    saveCustom,
    doResetBaseline,
    drag,
  } = useTargetsDraft({ uid, week, target, suggested, push });

  // --- Render ------------------------------------------------------

  if (!uid) return null;

  return (
    <div className="pb-8">
      {/* No title: the Week switch in the top bar already names the page. */}
      <header className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-ink-muted">{weekLabel(week)}</p>
        <button
          type="button"
          onClick={() => setReviewOpen(week)}
          className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98]"
        >
          Review
        </button>
      </header>

      {reviewOpen && <WeeklyReview week={reviewOpen} onClose={() => setReviewOpen(null)} />}

      {locked && (
        <p className="mb-4 rounded-lg bg-surface-1 px-3 py-2 text-sm text-ink-soft">
          This week is closed.
        </p>
      )}

      {loading && !target ? (
        <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>
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
              className="flex w-full items-center justify-between rounded-md border border-line px-4 py-3 text-left transition active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className={LABEL}>
                  Mode
                </span>
                <span className="ml-2 font-medium text-ink">
                  {mode === 'custom' ? 'Custom' : PRESETS[mode].label}
                </span>
                {suggestPending && (
                  <span className="ml-2 text-xs text-ink-muted">
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
                className={`h-4 w-4 shrink-0 text-ink-muted transition ${modeOpen ? 'rotate-180' : ''}`}
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
                <h2 className={LABEL}>
                  Your hours
                </h2>
                <span className="text-xs text-ink-muted">
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
                    className={`${btn('secondary')} flex-1`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCustom}
                    disabled={busy || !check?.ok}
                    className={`${btn('primary')} flex-1`}
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

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ------------------------------------------------------------
// Mode card
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// Slider
// ------------------------------------------------------------

// ------------------------------------------------------------
// Debt
// ------------------------------------------------------------

// ------------------------------------------------------------
// Streak
// ------------------------------------------------------------

// ------------------------------------------------------------
// Confirm sheet
// ------------------------------------------------------------
