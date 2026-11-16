'use client';

import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export function useToasts(ttlMs = 5000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, action?: Toast['action']) => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, action }]);
      setTimeout(() => dismiss(id), ttlMs);
      return id;
    },
    [dismiss, ttlMs]
  );

  return { toasts, push, dismiss };
}
