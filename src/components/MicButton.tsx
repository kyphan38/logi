'use client';

import { useRef, useState } from 'react';

import { useTick } from '@/hooks/useActivities';
import { useRecorder, type Recording } from '@/hooks/useRecorder';

/** Vuốt lên quá ngần này rồi thả = huỷ, không gửi đi. */
const CANCEL_DY = 80;

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[26px] w-[26px]">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" strokeLinecap="round" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="h-[26px] w-[26px] animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

/**
 * FAB giữ-để-nói, nổi phía trên bottom nav.
 * Ẩn hẳn khi trình duyệt không ghi âm được — lúc đó chỉ còn nhập tay.
 */
export default function MicButton({
  onResult,
  disabled = false,
  thinking = false,
}: {
  onResult: (r: Recording) => void;
  disabled?: boolean;
  /** Đang chờ /api/parse trả lời. Giữ spinner để người dùng biết máy còn nghĩ. */
  thinking?: boolean;
}) {
  const { state, start, stop, cancel, level, error, supported } = useRecorder();
  const [startedAt, setStartedAt] = useState(0);
  const [armed, setArmed] = useState(false); // đang ở vùng huỷ
  const startYRef = useRef(0);

  const recording = state === 'recording';
  const busy = state === 'requesting' || state === 'processing' || thinking;

  const now = useTick(250, recording);
  const secs = recording && startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  if (!supported) return null;

  function press(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || busy || recording) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    setArmed(false);
    setStartedAt(Date.now());
    navigator.vibrate?.(10); // Android rung nhẹ; iOS bỏ qua
    // Gọi thẳng, KHÔNG await gì trước: Safari cần getUserMedia trong cùng tick chạm.
    void start();
  }

  function move(e: React.PointerEvent<HTMLButtonElement>) {
    if (!recording) return;
    setArmed(startYRef.current - e.clientY > CANCEL_DY);
  }

  async function release() {
    if (!recording && !busy) return;
    if (armed) {
      setArmed(false);
      cancel();
      return;
    }
    const rec = await stop();
    if (rec) onResult(rec);
  }

  const label = armed ? 'Release to cancel' : recording ? `${secs}s · slide up to cancel` : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 px-5 md:bottom-6 md:pl-[180px] md:pr-6">
      {error ? (
        <p
          role="alert"
          className="pointer-events-auto max-w-xs rounded-md bg-red-600 px-3 py-2 text-xs text-white shadow-lg"
        >
          {error}
        </p>
      ) : null}

      {label ? (
        <span
          className={[
            'rounded-full px-3 py-1 text-xs font-medium tabular-nums shadow-lg',
            armed ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
          ].join(' ')}
        >
          {label}
        </span>
      ) : null}

      <div className="pointer-events-auto relative">
        {/* Vòng sóng — to nhỏ theo `level`, nằm dưới nút nên không chắn ngón tay. */}
        {recording ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-red-500/25 transition-transform duration-75"
            style={{ transform: `scale(${1 + level * 0.9})` }}
          />
        ) : null}

        <button
          type="button"
          disabled={disabled}
          aria-label={recording ? 'Release to log' : 'Hold to record'}
          onPointerDown={press}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
          // iOS hiện menu copy/paste khi giữ lâu nếu thiếu hai dòng này.
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
          className={[
            // 64px trên điện thoại (ngón cái với tới), 56px trên desktop nơi có chuột.
            'relative flex h-16 w-16 select-none items-center justify-center rounded-full transition md:h-14 md:w-14',
            // Bóng đậm + quầng sáng mỏng: tách hẳn nút khỏi nội dung phía sau.
            'shadow-[0_8px_24px_rgb(0_0_0/0.28)] ring-1 ring-black/5',
            'disabled:opacity-50',
            recording
              // 64 → 76px.
              ? 'scale-[1.1875] bg-red-600 text-white ring-4 ring-red-500/40'
              : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
            armed ? 'opacity-60' : '',
          ].join(' ')}
        >
          {busy ? <Spinner /> : <MicIcon />}
          {recording ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-pulse rounded-full ring-2 ring-red-400"
            />
          ) : null}
        </button>
      </div>

      {state === 'processing' || thinking ? (
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          Thinking…
        </span>
      ) : null}
    </div>
  );
}
