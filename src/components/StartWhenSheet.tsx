'use client';

import { useState } from 'react';

import { resolveClockTime, relativeLabel, toClockInput, type ClockDir } from '@/lib/clock';
import { clockTime } from '@/lib/datetime';
import { CATEGORY_LABEL, type Category } from '@/types/logi';

// -----------------------------------------------------------------------------
// logi - "Khi nào bắt đầu" (giữ lâu một nút category)
//
// Ba đường vào cùng một câu hỏi, xếp theo mức độ hay dùng:
//   1. chip khoảng cách  - 7:30 mới nhớ mở app, thật ra làm từ 7:15
//   2. ô giờ cụ thể      - nhớ chính xác, hoặc lâu hơn 1 tiếng
//   3. chiều After       - hẹn giờ trước, ghi status 'scheduled'
//
// Chip commit NGAY, không có bước xác nhận: đằng nào toast cũng có Undo 5 giây.
// Ô giờ cụ thể thì phải bấm nút - gõ giờ là việc dễ gõ nhầm.
//
// Mọi nhãn giờ đọc từ prop `now` chứ không phải `Date.now()`. Nhãn hiện ra và
// mốc thật sự ghi xuống vì thế không bao giờ vênh nhau.
// -----------------------------------------------------------------------------

/** Bốn khoảng quen thuộc. Xa hơn 1 tiếng thì gõ giờ nhanh hơn là đếm chip. */
const OFFSETS = [5, 15, 30, 60] as const;

export interface StartWhen {
  /** `null` = bắt đầu ngay bây giờ. */
  startAt: number | null;
  /** `true` → ghi `status: 'scheduled'`, để `promoteScheduled()` bật lên sau. */
  scheduled: boolean;
}

const offsetLabel = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`);

export default function StartWhenSheet({
  category,
  now,
  onPick,
  onClose,
}: {
  category: Category;
  /** Mốc "bây giờ" của trang. Chỉ nhích mỗi phút - đủ cho một cái áng chừng. */
  now: number;
  onPick: (when: StartWhen) => void;
  onClose: () => void;
}) {
  const [dir, setDir] = useState<ClockDir>('past');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => toClockInput(now));

  const past = dir === 'past';
  const sign = past ? -1 : 1;
  const typed = resolveClockTime(text, now, dir);

  const commit = (startAt: number) => onPick({ startAt, scheduled: !past });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Start ${CATEGORY_LABEL[category]} at a different time`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-lg bg-surface-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Start {CATEGORY_LABEL[category]}</h2>

        {/* Before / After. Before mặc định vì "quên bấm" hay xảy ra hơn "hẹn trước". */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-sm bg-surface-1 p-1">
          {(['past', 'future'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dir === d}
              onClick={() => setDir(d)}
              className={[
                'min-h-10 rounded-sm text-sm transition',
                dir === d
                  ? 'border border-line-strong bg-surface-2 font-medium text-ink'
                  : 'text-ink-soft',
              ].join(' ')}
            >
              {d === 'past' ? 'Before' : 'After'}
            </button>
          ))}
        </div>

        {/* Dòng 2 của mỗi chip là giờ thật, để khỏi phải nhẩm trừ trong đầu. */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {OFFSETS.map((m) => {
            const ts = now + sign * m * 60_000;
            return (
              <button
                key={m}
                type="button"
                onClick={() => commit(ts)}
                aria-label={`${offsetLabel(m)} ${past ? 'ago' : 'from now'}, ${clockTime(ts)}`}
                className="flex min-h-14 flex-col items-center justify-center rounded-sm border border-line active:scale-[0.99]"
              >
                <span className="text-sm font-medium">{offsetLabel(m)}</span>
                <span className="text-xs tabular-nums text-ink-muted">{clockTime(ts)}</span>
              </button>
            );
          })}
        </div>

        {open ? (
          <div className="mt-3 rounded-sm border border-line p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">
                {past ? 'Started at' : 'Starting at'}
              </span>
              <input
                type="time"
                value={text}
                autoFocus
                onChange={(e) => setText(e.target.value)}
                aria-invalid={typed === null}
                className="min-h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-base"
              />
            </label>

            {/* Xác nhận sống: nói ra ngày nào, cách bây giờ bao lâu. Đây là chỗ
                người dùng phát hiện mình vừa gõ nhầm sang đêm hôm trước. */}
            <p className="mt-2 min-h-5 text-xs tabular-nums text-ink-muted">
              {typed === null ? '—' : `${clockTime(typed)} · ${relativeLabel(typed, now)}`}
            </p>

            <button
              type="button"
              disabled={typed === null}
              onClick={() => typed !== null && commit(typed)}
              className="mt-2 min-h-11 w-full rounded-sm bg-blue-600 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-40"
            >
              {past ? 'Start' : 'Schedule'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 min-h-11 w-full rounded-sm text-sm text-ink-soft"
          >
            Specific time…
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
