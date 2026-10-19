'use client';

import { useEffect, useState } from 'react';

import { changedDigits, reducedMotion } from '@/lib/motion';

/** Matches `.digit-in` / `.digit-out` in globals.css. */
const ROLL_MS = 280;

/**
 * A time like 2:41:07. Hour and minute digits roll when they change; seconds
 * change every second, so they never roll. Screen readers get the whole
 * string once.
 */
export default function RollingDigits({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const [roll, setRoll] = useState<{ old: string; at: Set<number>; n: number } | null>(null);

  // Derived during render, so the new digit and the old one appear together.
  if (text !== shown) {
    const secondsFrom = text.lastIndexOf(':');
    const at = changedDigits(shown, text).filter((i) => i < secondsFrom && text[i] !== ':');
    setShown(text);
    setRoll(at.length > 0 && !reducedMotion() ? { old: shown, at: new Set(at), n: (roll?.n ?? 0) + 1 } : null);
  }

  useEffect(() => {
    if (!roll) return;
    const t = setTimeout(() => setRoll(null), ROLL_MS);
    return () => clearTimeout(t);
  }, [roll]);

  const sameShape = roll !== null && roll.old.length === text.length;

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {[...text].map((c, i) =>
          roll?.at.has(i) ? (
            // A new key restarts the animation if the digit changes again.
            <span key={`${i}-${roll.n}`} className="relative inline-block">
              <span className="digit-in inline-block">{c}</span>
              {sameShape ? <span className="digit-out absolute inset-0">{roll.old[i]}</span> : null}
            </span>
          ) : (
            <span key={i}>{c}</span>
          ),
        )}
      </span>
    </>
  );
}
