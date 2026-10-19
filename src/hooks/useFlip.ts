'use client';

import { useLayoutEffect, useRef } from 'react';

import { reducedMotion } from '@/lib/motion';

/**
 * FLIP for a list: when items move, each one slides from its old spot to
 * its new one instead of jumping. Register rows with `ref(id)`.
 */
export function useFlip(order: string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, number>());
  const key = order.join('|');

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    nodes.current.forEach((el, id) => next.set(id, el.getBoundingClientRect().top));
    if (!reducedMotion()) {
      next.forEach((top, id) => {
        const before = last.current.get(id);
        const el = nodes.current.get(id);
        if (before === undefined || !el || before === top || typeof el.animate !== 'function') return;
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 260,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
      });
    }
    last.current = next;
  }, [key]);

  return (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
}
