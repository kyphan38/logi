'use client';

import { useCallback, useEffect, useRef } from 'react';
import { isRealTap, type Press } from '@/lib/tap-guard';

/*
 * -----------------------------------------------------------------------------
 * // logi - Biến một khối div thành nút bấm được, mà không bắt nhầm cú vuốt
 * -----------------------------------------------------------------------------
 *
 * Trên iOS, cuộn danh sách rồi nhả tay vẫn sinh ra `click`. Với nút thật thì
 * hiếm khi phiền, nhưng card session chiếm gần hết bề ngang màn Now - vuốt
 * trúng nó là chuyện thường. `isRealTap()` (src/lib/tap-guard.ts) loại các ca
 * đó; file này chỉ lo phần React và DOM.
 *
 * Cuộn là việc của cả trang, không phải của từng card. Nên chỉ một listener,
 * đếm số card đang dùng để biết lúc nào gỡ.
 */

let lastScrollAt: number | null = null;
let users = 0;

function trackScroll(e: Event) {
  lastScrollAt = e.timeStamp;
}

/** `capture: true` để bắt cả cuộn trong container con, không riêng window. */
function subscribe(): () => void {
  users += 1;
  if (users === 1) {
    window.addEventListener('scroll', trackScroll, { passive: true, capture: true });
  }
  return () => {
    users -= 1;
    if (users === 0) {
      window.removeEventListener('scroll', trackScroll, { capture: true });
      lastScrollAt = null;
    }
  };
}

export interface TapHandlers {
  role: 'button';
  tabIndex: 0;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Trả về props để rải vào một `<div>`. `undefined` khi không có `onTap` - để
 * chỗ gọi cứ rải thẳng mà khối vẫn trơ như cũ.
 */
export function useTap(onTap: (() => void) | undefined): TapHandlers | undefined {
  const down = useRef<{ x: number; y: number; at: number } | null>(null);

  useEffect(subscribe, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, at: e.timeStamp };
  }, []);

  const clear = useCallback(() => {
    down.current = null;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || !onTap) return;
      const p: Press = {
        downX: d.x,
        downY: d.y,
        downAt: d.at,
        upX: e.clientX,
        upY: e.clientY,
        upAt: e.timeStamp,
        lastScrollAt,
      };
      if (!isRealTap(p)) return;
      onTap();
    },
    [onTap],
  );

  // Bàn phím không vuốt được, nên không phải lọc gì.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!onTap) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onTap();
    },
    [onTap],
  );

  if (!onTap) return undefined;

  return {
    role: 'button',
    tabIndex: 0,
    onPointerDown,
    onPointerUp,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onKeyDown,
  };
}
