'use client';

// ---------------------------------------------------------------------------
// logi - Bộ lọc khoảng thời gian cho Analytics (Stage 5 Task 1)
//
// Toàn bộ số học nằm ở `@/lib/range`. Component này chỉ là bàn phím bấm.
// ---------------------------------------------------------------------------
import { useState } from 'react';

import { logicalDate } from '@/lib/balance';
import {
  buildRange,
  chipLabel,
  customRange,
  daysBetween,
  lastNDays,
  rangeLabel,
  type Range,
  type RangeKind,
} from '@/lib/range';

const CHIPS: Exclude<RangeKind, 'custom'>[] = ['this_week', 'last_week', 'this_month'];

interface Props {
  value: Range;
  onChange: (r: Range) => void;
  /** Truyền vào để test được; mặc định là đồng hồ thật. */
  now: number;
}

export default function RangePicker({ value, onChange, now }: Props) {
  const [open, setOpen] = useState(value.kind === 'custom');
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [error, setError] = useState<string | null>(null);

  // Bấm chip khác → đóng khay custom và đồng bộ lại hai ô ngày.
  // Chỉnh ngay trong lúc render chứ không dùng effect: effect chạy sau khi vẽ,
  // nên khay sẽ nháy một nhịp rồi mới đóng.
  const stamp = `${value.kind}|${value.from}|${value.to}`;
  const [prevStamp, setPrevStamp] = useState(stamp);
  if (prevStamp !== stamp) {
    setPrevStamp(stamp);
    if (value.kind !== 'custom') {
      setOpen(false);
      setFrom(value.from);
      setTo(value.to);
      setError(null);
    }
  }

  const today = logicalDate(now);

  function apply(nextFrom: string, nextTo: string) {
    const res = customRange(nextFrom, nextTo, now);
    setError(res.error);
    if (res.range) onChange(res.range);
  }

  function quick(n: number) {
    const r = lastNDays(n, now);
    setFrom(r.from);
    setTo(r.to);
    setError(null);
    onChange(r);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Cuộn ngang chỉ ở hàng chip - phần chart bên dưới không bao giờ cuộn ngang.
          -mx-5/px-5 khớp với padding của AppShell, để chip chạm sát mép khi cuộn. */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS.map((kind) => (
          <Chip
            key={kind}
            active={value.kind === kind}
            onClick={() => onChange(buildRange(kind, now))}
            label={chipLabel(kind)}
          />
        ))}
        <Chip
          active={value.kind === 'custom'}
          onClick={() => {
            setOpen((v) => !v);
            if (value.kind !== 'custom') apply(from, to);
          }}
          label={value.kind === 'custom' ? rangeLabel(value) : 'Custom'}
        />
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <DateField
              label="From"
              value={from}
              max={today}
              onChange={(v) => {
                setFrom(v);
                apply(v, to);
              }}
            />
            <DateField
              label="To"
              value={to}
              max={today}
              onChange={(v) => {
                setTo(v);
                apply(from, v);
              }}
            />
          </div>

          <div className="flex gap-2">
            <Chip active={false} onClick={() => quick(7)} label="Last 7 days" />
            <Chip active={false} onClick={() => quick(30)} label="Last 30 days" />
          </div>

          {error ? (
            <p className="text-[13px] text-ink-soft">{error}</p>
          ) : (
            <p className="text-[13px] text-ink-muted tabular-nums">
              {daysBetween(from, to)} days
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition active:scale-[0.98]',
        active
          ? 'border-transparent bg-ink text-[var(--surface-0)]'
          : 'border-line bg-surface-1 text-ink-soft',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function DateField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type="date"
        value={value}
        // Ngày mai chưa xảy ra - cho chọn thì chart sẽ báo thiếu mà không có cách nào bù.
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-line bg-surface-0 px-2 py-1.5 text-ink"
      />
    </label>
  );
}
