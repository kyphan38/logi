'use client';

import type { ReactNode } from 'react';

/**
 * Khung cho card voice (confirm / clarify) ở Task 7.
 *
 * - Trượt lên từ đáy, đè lên nội dung, nhưng KHÔNG che cả màn hình:
 *   phía trên vẫn thấy session đang chạy.
 * - Nằm trên bottom nav (z-50) và dưới modal (z-[60]).
 * - Chừa chỗ cho bottom nav + safe area của iPhone.
 * - Card cao quá thì cuộn trong chính nó, không kéo cả trang.
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
        className="sheet-up pointer-events-auto max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl shadow-2xl"
        style={{ overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>
  );
}
