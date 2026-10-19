'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { dragOffset, reducedMotion, sheetShouldClose } from '@/lib/motion';

/** Matches `.fade-out` / `.sheet-down` in globals.css. */
const EXIT_MS = 200;
const SWIPE_OUT_MS = 180;
/** Below this the drag was a tap on the header, even if it was quick. */
const MIN_SWIPE_PX = 16;
/** Same breakpoint as Tailwind `md`. */
const NARROW = '(max-width: 767px)';
const CONTROLS = 'button, a, input, select, textarea, [role="slider"]';

/**
 * Backdrop + bottom sheet shared by every sheet. Slides in, slides out when
 * the user closes it (backdrop, swipe down, Esc), and on a phone it follows
 * a finger dragging its header down.
 *
 * Buttons inside call their own handlers and the sheet goes at once: the
 * toast that follows is the feedback, so nobody waits on an animation.
 */
export default function SheetShell({
  onClose,
  labelledBy,
  label,
  header,
  center = false,
  z = 50,
  dim = 40,
  locked = false,
  className = '',
  children,
}: {
  /** Leave out for a sheet that must be answered: no backdrop close, no swipe, no Esc. */
  onClose?: () => void;
  labelledBy?: string;
  label?: string;
  /** The title area. On a phone it is the drag zone, with the handle above it. */
  header?: ReactNode;
  /** md and up: centered in the screen instead of at the bottom. */
  center?: boolean;
  z?: 50 | 60;
  dim?: 30 | 40;
  /** No swipe while saving. */
  locked?: boolean;
  /** Classes of the panel itself: width, padding, background, rounding. */
  className?: string;
  children: ReactNode;
}) {
  // 'anim': exit classes play. 'swipe': the finger threw it out, styles finish it.
  const [exit, setExit] = useState<'anim' | 'swipe' | null>(null);
  const closing = exit !== null;
  const panel = useRef<HTMLDivElement>(null);
  const mover = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; lastY: number; lastT: number; v: number; dy: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const close = useCallback(() => {
    if (!onClose || closing) return;
    if (reducedMotion()) {
      onClose();
      return;
    }
    setExit('anim');
    timer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose, closing]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, close]);

  const canSwipe = () =>
    !!onClose && !closing && !locked && typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches;

  // Drag writes styles through refs: no re-render per pointer move.
  function setDrag(offset: number, height: number, transition: string) {
    const m = mover.current;
    const b = backdrop.current;
    if (!m || !b) return;
    m.style.transition = transition;
    b.style.transition = transition.replace('transform', 'opacity');
    m.style.transform = offset === 0 ? '' : `translateY(${offset}px)`;
    b.style.opacity = offset <= 0 ? '' : String(Math.max(0, 1 - offset / height));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canSwipe() || e.button !== 0) return;
    // Pointer capture would steal the click from a control in the header.
    if ((e.target as HTMLElement).closest(CONTROLS)) return;
    drag.current = { y: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.dy = e.clientY - d.y;
    setDrag(dragOffset(d.dy), panel.current?.offsetHeight ?? 1, 'none');
  }

  function onPointerEnd(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const height = panel.current?.offsetHeight ?? 1;
    const swiped = e.type === 'pointerup' && d.dy > MIN_SWIPE_PX && sheetShouldClose(d.dy, height, d.v);
    if (!swiped || !onClose) {
      setDrag(0, height, 'transform 200ms var(--ease-soft)');
      return;
    }
    if (reducedMotion()) {
      onClose();
      return;
    }
    // Keep sliding from where the finger let go, no jump back first.
    setExit('swipe');
    const m = mover.current;
    const b = backdrop.current;
    if (m && b) {
      m.style.transition = `transform ${SWIPE_OUT_MS}ms ease-in`;
      b.style.transition = `opacity ${SWIPE_OUT_MS}ms ease-in`;
      m.style.transform = 'translateY(100%)';
      b.style.opacity = '0';
    }
    timer.current = setTimeout(onClose, SWIPE_OUT_MS);
  }

  const swipeable = !!onClose;
  const animOut = exit === 'anim';

  return (
    <div
      className={[
        'fixed inset-0 flex items-end justify-center',
        z === 60 ? 'z-[60]' : 'z-50',
        center ? 'md:items-center' : '',
        closing ? 'pointer-events-none' : '',
      ].join(' ')}
    >
      {/* Same split for the backdrop: the outer layer takes the drag opacity. */}
      <div ref={backdrop} aria-hidden="true" className="absolute inset-0" onClick={swipeable ? close : undefined}>
        <div
          className={[
            'absolute inset-0',
            dim === 30 ? 'bg-black/30' : 'bg-black/40',
            animOut ? 'fade-out' : 'fade-in',
          ].join(' ')}
        />
      </div>
      {/* `mover` takes the drag transform; the panel inside keeps the CSS
          animation, so the two never overwrite each other. */}
      <div ref={mover} className="pointer-events-none relative flex w-full justify-center">
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          className={[
            'pointer-events-auto',
            animOut ? 'sheet-down' : 'sheet-up',
            className,
          ].join(' ')}
          style={{ overscrollBehavior: 'contain' }}
        >
          {swipeable || header ? (
            <div
              className={swipeable ? 'touch-none select-none md:touch-auto md:select-auto' : undefined}
              onPointerDown={swipeable ? onPointerDown : undefined}
              onPointerMove={swipeable ? onPointerMove : undefined}
              onPointerUp={swipeable ? onPointerEnd : undefined}
              onPointerCancel={swipeable ? onPointerEnd : undefined}
            >
              {swipeable ? (
                <div className="-mt-1 flex justify-center pb-2 md:hidden" aria-hidden="true">
                  <span className="h-1 w-10 rounded-full bg-line-strong" />
                </div>
              ) : null}
              {header}
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
