'use client';

import type { ReactNode } from 'react';

/**
 * Frame for the voice card (confirm / clarify) in Task 7.
 *
 * - Slides up from the bottom over the content, but does NOT cover the whole
 *   screen: running sessions stay visible above.
 * - Sits above the bottom nav (z-50) and below modals (z-[60]).
 * - Leaves room for the bottom nav + the iPhone safe area.
 * - A tall card scrolls inside itself, never dragging the whole page.
 */
export default function VoiceSheet({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        'pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4',
        'pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-6 md:pl-56',
      ].join(' ')}
    >
      <div
        className="sheet-up pointer-events-auto max-h-[70vh] w-full max-w-md overflow-y-auto rounded-lg shadow-2xl"
        style={{ overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>
  );
}
