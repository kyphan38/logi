'use client';

// ---------------------------------------------------------------------------
// logi - Error boundary cho các màn chính (Stage 6 Task 5)
//
// Next bọc từng route segment bằng file này, nên lỗi ở /now không kéo theo
// /history. Thanh điều hướng nằm ở layout phía trên nên vẫn còn: người dùng
// luôn đi được sang màn khác thay vì nhìn trang trắng.
//
// Next 16: prop là `retry` (tải và render lại), không phải `reset`.
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
    // Chỉ tên lỗi, message và digest. KHÔNG log activity, label hay uid -
    // console của trình duyệt không phải chỗ để dữ liệu cá nhân nằm lại.
    console.error('[logi] screen crashed:', error.name, error.message, error.digest ?? '');
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-line-strong bg-surface-1 p-4">
      <h2 className="text-base font-semibold text-ink">This screen stopped working</h2>
      <p className="text-[13px] text-ink-soft">
        Your data is safe - nothing was lost. Try loading the screen again.
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
