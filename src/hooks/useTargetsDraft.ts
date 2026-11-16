'use client';

import { useCallback, useMemo, useState } from 'react';

import { useTick } from '@/hooks/useActivities';
import { MAX_PINNED, rebalance, validateTargets } from '@/lib/balance';
import { reapplyDebt, roundToBudget, type Weekly } from '@/lib/rollover';
import { TargetError, resetBaseline, setCustomTargets, setPreset } from '@/lib/targets';
import { ADJUSTABLE, msg, type ModeId } from '@/lib/targets-view';
import { isWeekClosed } from '@/lib/week';
import { PRESETS, type Category, type PresetId, type WeekTarget } from '@/types/logi';

/** Draft hours, pins, mode and the save actions of the Targets screen. */
export function useTargetsDraft({
  uid,
  week,
  target,
  suggested,
  push,
}: {
  uid: string | null;
  week: string;
  target: WeekTarget | null;
  suggested: PresetId | null;
  push: (text: string) => void;
}) {
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

  return {
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
  };
}
