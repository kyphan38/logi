'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * One shared marker (a pill or a bar) that slides to the active item instead
 * of each item drawing its own. Mark the active child with `data-active`.
 * The first placement and resizes jump; only a change of `activeKey` slides.
 */
export function useIndicator<C extends HTMLElement, I extends HTMLElement>(activeKey: string) {
  const container = useRef<C>(null);
  const indicator = useRef<I>(null);
  const lastKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    const box = container.current;
    const mark = indicator.current;
    if (!box || !mark) return;

    const place = (slide: boolean) => {
      const active = box.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        mark.style.opacity = '0';
        return;
      }
      mark.style.transition = slide ? 'transform 260ms var(--ease-soft)' : 'none';
      mark.style.width = `${active.offsetWidth}px`;
      mark.style.transform = `translateX(${active.offsetLeft}px)`;
      mark.style.opacity = '';
    };

    // Compare keys, not a "placed" flag: Strict Mode runs this twice with the
    // same key, and that must not slide.
    place(lastKey.current !== null && lastKey.current !== activeKey);
    lastKey.current = activeKey;

    if (typeof ResizeObserver === 'undefined') return;
    // `observe` reports once right away; skipping it keeps the slide running.
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [activeKey]);

  return { container, indicator };
}
