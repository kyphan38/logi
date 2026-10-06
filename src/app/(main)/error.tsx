'use client';

// ---------------------------------------------------------------------------
// logi - Error boundary for the main screens (Stage 6 Task 5)
//
// Next wraps each route segment in this file, so an error in /now does not
// take /history down. The nav lives in the layout above, so it stays: the
// user can always move to another screen instead of a blank page.
//
// Next 16: the prop is `retry` (reload and re-render), not `reset`.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';

export default function MainError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Only the error name, message and digest. NEVER log activities, labels or
    // uid - the browser console is no place for personal data to linger.
    console.error('[logi] screen crashed:', error.name, error.message, error.digest ?? '');
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-line-strong bg-surface-1 p-4">
      <h2 className="text-base font-semibold text-ink">This screen stopped working</h2>
      <p className="text-[13px] text-ink-soft">
        Your data is safe.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-[var(--surface-0)] transition active:scale-[0.99]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-sm border border-line px-4 py-2 text-sm text-ink-soft transition active:scale-[0.99]"
        >
          Reload app
        </button>
      </div>
    </div>
  );
}
