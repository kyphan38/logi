'use client';

import { useState } from 'react';

import { resolveClockOnDate, toClockInput } from '@/lib/clock';
import { formatBedtime } from '@/lib/bedtime';
import type { DayLog } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - "Đêm hôm đó đi ngủ lúc mấy giờ" (History)
//
// Anh em của `BedtimeSheet` bên Now, khác đúng một điểm và điểm đó là lý do nó
// tồn tại: NGÀY ĐƯỢC CHO TRƯỚC, lấy từ thanh chọn ngày của History.
//
// Sheet bên Now suy ngày ra từ giờ ("gần nhất trong quá khứ"), nên nó không bao
// giờ với xa quá 24 tiếng - quên ghi hai đêm là hết đường. Ở đây ngày đã nằm sẵn
// trong tay, nên chỉ còn việc ghép giờ vào đúng đêm đó.
//
// Vẫn KHÔNG có ô chọn ngày trong sheet: chọn ngày là việc của thanh ngày phía
// trên, hỏi lại lần nữa thì hai chỗ có thể nói hai đằng.
// ---------------------------------------------------------------------------

/** Giờ hay đi ngủ. Bốn ô một hàng, hai ô cuối vắt qua nửa đêm. */
const CHIPS = ['22:00', '23:00', '00:00', '01:00'] as const;

/** '2026-09-05' → 'Fri, Sep 5'. Có thứ mới nhận ra được đêm nào. */
function nightLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Mốc epoch → 'Sat, Sep 6'. Ngày LỊCH của mốc, không phải ngày logic. */
function stampLabel(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function DayBedtimeSheet({
  date,
  log,
  busy,
  onPick,
  onClear,
  onClose,
}: {
  /** Ngày logic đang xem ở History - đêm sẽ được ghi vào. */
  date: string;
  /** Mốc hiện có của chính ngày đó. */
  log: DayLog;
  busy: boolean;
  onPick: (at: number) => void;
  onClear: (date: string) => void;
  onClose: () => void;
}) {
  const current = log.bedtimeAt;
  // Có mốc rồi thì mở ra đúng giờ cũ: sửa 23:10 thành 23:40 không phải gõ lại
  // từ đầu. Chưa có thì 23:00 cho đỡ phải kéo số.
  const [text, setText] = useState(() => (current === null ? '23:00' : toClockInput(current)));
  const typed = resolveClockOnDate(text, date);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Bedtime"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-lg bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Bedtime</h2>
        {/* Nói thẳng đang sửa đêm nào. Sheet mở từ header, mà header thì cuộn
            đi mất - không có dòng này thì rất dễ ghi nhầm sang ngày khác. */}
        <p className="mt-0.5 text-xs text-ink-muted">Night of {nightLabel(date)}</p>

        <div className="mt-3 flex min-h-11 items-center gap-3 rounded-sm border border-line bg-surface-1 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">Logged</span>
          <span className="shrink-0 tabular-nums">
            {current === null ? '-' : formatBedtime(current)}
          </span>
          {current === null ? null : (
            <button
              type="button"
              onClick={() => onClear(date)}
              disabled={busy}
              aria-label="Clear bedtime"
              className="min-h-11 shrink-0 px-1 text-ink-soft transition active:scale-95 disabled:opacity-40"
            >
              ×
            </button>
          )}
        </div>

        {/* Dòng 2 của mỗi ô là NGÀY LỊCH của mốc. 00:00 và 01:00 rơi sang hôm
            sau, nhưng vẫn thuộc đêm này - viết ra thì khỏi phải tin lời. */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {CHIPS.map((hhmm) => {
            const ts = resolveClockOnDate(hhmm, date);
            if (ts === null) return null;
            return (
              <button
                key={hhmm}
                type="button"
                onClick={() => onPick(ts)}
                disabled={busy}
                aria-label={`${hhmm} on ${stampLabel(ts)}`}
                className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line transition active:scale-[0.99] disabled:opacity-40"
              >
                <span className="text-sm font-medium tabular-nums">{hhmm}</span>
                <span className="text-xs text-ink-muted">{stampLabel(ts).split(',')[0]}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-sm border border-line p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-soft">Went to bed at</span>
            <input
              type="time"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={typed === null}
              className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
            />
          </label>
          <p className="mt-2 min-h-5 text-xs tabular-nums text-ink-muted">
            {typed === null ? '-' : stampLabel(typed)}
          </p>
          <button
            type="button"
            disabled={busy || typed === null}
            onClick={() => typed !== null && onPick(typed)}
            className="mt-2 min-h-11 w-full rounded-sm bg-blue-600 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-1 min-h-11 w-full rounded-sm text-sm text-ink-soft"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
