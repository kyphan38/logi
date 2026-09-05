'use client';

import { useState } from 'react';

import { resolveClockTime, toClockInput } from '@/lib/clock';
import { logicalDate } from '@/lib/balance';
import { formatBedtime } from '@/lib/bedtime';
import { formatDuration } from '@/lib/datetime';
import type { DayLog } from '@/types/logi';

// ---------------------------------------------------------------------------
// logi - "Đi ngủ lúc mấy giờ" (Stage 8)
//
// Nút 🌙 cũ ghi thẳng `Date.now()`. Nhớ ra lúc 7:30 sáng thì mốc rơi vào sáng
// nay, sai hẳn một đêm; mà ghi nhầm rồi cũng không có đường xoá.
//
// Sheet này bày ra CẢ HAI đêm gần nhất, vì 7:30 sáng "đêm qua" với "đêm nay"
// là hai ngày logic khác nhau - đọc thấy thì hết cãi. Giờ ghi luôn lùi về quá
// khứ; 00:00 hay 01:00 vẫn thuộc đêm hôm trước, mốc cắt 04:00 lo việc đó.
// ---------------------------------------------------------------------------

/** Giờ hay đi ngủ. Bốn ô một hàng như sheet Start, ô đầu là "Now". */
const CHIPS = ['22:00', '23:00', '00:00'] as const;

/** '2026-09-05' → 'Fri, Sep 5'. Có thứ mới nhận ra được đêm nào. */
function nightLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function BedtimeSheet({
  tonight,
  lastNight,
  now,
  busy,
  onPick,
  onClear,
  onClose,
}: {
  /** Ngày logic hôm nay - đêm đang tới. */
  tonight: DayLog;
  /** Ngày logic hôm qua - đêm vừa rồi. */
  lastNight: DayLog;
  now: number;
  busy: boolean;
  onPick: (at: number) => void;
  onClear: (date: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => toClockInput(now));
  const typed = resolveClockTime(text, now, 'past');

  const rows = [
    { label: 'Last night', log: lastNight },
    { label: 'Tonight', log: tonight },
  ];

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

        {/* Hai đêm gần nhất. Đây là chỗ duy nhất xoá được một mốc ghi nhầm. */}
        <div className="mt-3 rounded-sm border border-line bg-surface-1">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex min-h-11 items-center gap-3 px-3 py-2 text-sm ${
                i > 0 ? 'border-t border-line' : ''
              }`}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.label}</span>
                <span className="text-ink-muted"> · {nightLabel(r.log.date)}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {r.log.bedtimeAt === null ? '-' : formatBedtime(r.log.bedtimeAt)}
              </span>
              {r.log.bedtimeAt === null ? null : (
                <button
                  type="button"
                  onClick={() => onClear(r.log.date)}
                  disabled={busy}
                  aria-label={`Clear ${r.label.toLowerCase()} bedtime`}
                  className="min-h-11 shrink-0 px-1 text-ink-soft transition active:scale-95 disabled:opacity-40"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Dòng 1 là giờ, dòng 2 là "cách đây bao lâu" - khỏi nhẩm trừ lúc nửa
            tỉnh nửa mê. */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onPick(now)}
            disabled={busy}
            className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line transition active:scale-[0.99] disabled:opacity-40"
          >
            <span className="text-sm font-medium">Now</span>
            <span className="text-xs tabular-nums text-ink-muted">{toClockInput(now)}</span>
          </button>
          {CHIPS.map((hhmm) => {
            const ts = resolveClockTime(hhmm, now, 'past');
            if (ts === null) return null;
            return (
              <button
                key={hhmm}
                type="button"
                onClick={() => onPick(ts)}
                disabled={busy}
                aria-label={`${hhmm}, ${formatDuration(now - ts)} ago`}
                className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line transition active:scale-[0.99] disabled:opacity-40"
              >
                <span className="text-sm font-medium tabular-nums">{hhmm}</span>
                <span className="text-xs tabular-nums text-ink-muted">
                  {formatDuration(now - ts)}
                </span>
              </button>
            );
          })}
        </div>

        {open ? (
          <div className="mt-3 rounded-sm border border-line p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Went to bed at</span>
              <input
                type="time"
                value={text}
                autoFocus
                onChange={(e) => setText(e.target.value)}
                aria-invalid={typed === null}
                className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
              />
            </label>
            {/* Nói rõ mốc rơi vào đêm nào: 01:00 là đêm hôm trước, không phải
                sáng nay. */}
            <p className="mt-2 min-h-5 text-xs tabular-nums text-ink-muted">
              {typed === null
                ? '-'
                : `${formatDuration(now - typed)} ago · night of ${nightLabel(logicalDate(typed))}`}
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
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 min-h-11 w-full rounded-sm text-sm text-ink-soft"
          >
            Specific time
          </button>
        )}

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
