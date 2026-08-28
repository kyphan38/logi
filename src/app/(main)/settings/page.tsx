'use client';

// ---------------------------------------------------------------------------
// logi - Settings (Stage 6 Task 2)
//
// Chỉ hai thứ: bật push, và đường vào trang khôi phục. Không phải màn hình
// dùng hằng ngày nên không có trong thanh điều hướng.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import { deleteAllInsights, listInsights } from '@/lib/insights';
import {
  disablePush,
  enablePush,
  isIOS,
  isStandalone,
  pushState,
  PushError,
  type PushState,
} from '@/lib/push';

export default function SettingsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [state, setState] = useState<PushState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void pushState().then(setState);
  }, []);

  useEffect(refresh, [refresh]);

  async function turnOn() {
    if (!uid) return;
    setBusy(true);
    setError(null);
    try {
      await enablePush(uid);
      setEnabled(true);
      refresh();
    } catch (e) {
      setError(e instanceof PushError ? e.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!uid) return;
    setBusy(true);
    try {
      await disablePush(uid);
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-[13px] text-ink-muted">Notifications and data.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-1 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-ink">Reminders on the lock screen</h2>
          <p className="text-[13px] text-ink-muted">
            06:15 and 20:45 study checks, plus the Sunday wrap-up - even when the
            app is closed. In-app reminders keep working either way.
          </p>
        </div>

        {state === null ? (
          <p className="text-[13px] text-ink-muted">Checking…</p>
        ) : state === 'unsupported' ? (
          <p className="text-[13px] text-ink-soft">
            {isIOS() && !isStandalone()
              ? 'On iPhone this only works after you add logi to the Home Screen. Open it in Safari, tap Share, then "Add to Home Screen", and come back here from that icon.'
              : 'This browser cannot show push notifications.'}
          </p>
        ) : state === 'denied' ? (
          <p className="text-[13px] text-ink-soft">
            Notifications are blocked for this app. Turn them back on in your
            device settings, then reload.
          </p>
        ) : enabled ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[13px] text-ink-soft">This device will get reminders.</p>
            <button
              type="button"
              onClick={() => void turnOff()}
              disabled={busy}
              className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98] disabled:opacity-40"
            >
              Turn off
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy || !uid}
            className="self-start rounded-sm bg-ink px-4 py-2 text-sm font-medium text-[var(--surface-0)] transition active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? 'Turning on…' : 'Turn on reminders'}
          </button>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </section>

      <InsightData uid={uid} />

      <section className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-1 p-4">
        <h2 className="text-sm font-medium text-ink">Your data</h2>
        <p className="text-[13px] text-ink-muted">
          Export lives on the Analytics screen. Pick “All time” for a full backup.
        </p>
        <Link href="/settings/restore" className="text-[13px] text-ink-soft underline">
          Restore from a backup file
        </Link>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nhận xét AI đã lưu (Stage 7 Task 8)
//
// Insight là suy diễn về đời sống riêng, nên phải xoá được - và xoá thật,
// không phải ẩn đi. Record gốc không đụng tới.
// ---------------------------------------------------------------------------

function InsightData({ uid }: { uid: string | null }) {
  const [count, setCount] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void listInsights(uid)
      .then((xs) => alive && setCount(xs.length))
      .catch(() => alive && setCount(0));
    return () => {
      alive = false;
    };
  }, [uid]);

  async function wipe() {
    if (!uid) return;
    setBusy(true);
    try {
      await deleteAllInsights(uid);
      setCount(0);
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-1 p-4">
      <h2 className="text-sm font-medium text-ink">Saved insights</h2>
      <p className="text-[13px] text-ink-muted">
        Notes written by the analysis on the Analytics screen. Your records stay
        untouched - only the notes go.
      </p>

      {count === null ? (
        <p className="text-[13px] text-ink-muted">Checking…</p>
      ) : count === 0 ? (
        <p className="text-[13px] text-ink-soft">Nothing saved.</p>
      ) : asking ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[13px] text-ink-soft">Delete {count}?</p>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98]"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void wipe()}
            className="shrink-0 rounded-sm bg-ink px-3 py-1.5 text-[13px] font-medium text-[var(--surface-0)] transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="self-start rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98]"
        >
          Delete {count} saved {count === 1 ? 'insight' : 'insights'}
        </button>
      )}
    </section>
  );
}
