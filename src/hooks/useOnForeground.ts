'use client';

import { useEffect, useRef } from 'react';

export function useOnForeground(fn: () => void) {
  const ref = useRef(fn);

  useEffect(() => {
    ref.current = fn;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, []);
}
