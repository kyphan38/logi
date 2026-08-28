'use client';

import { useMemo } from 'react';
import { coverageOfDay, dayWindow, layoutDay } from '@/lib/timeline';
import { formatDuration } from '@/lib/datetime';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

// -----------------------------------------------------------------------------
// logi - Thanh ngang "hôm nay" trên màn Now (Stage 4.6)
//
// Cùng dữ liệu với Timeline của History, nhưng nằm ngang và cao 20px: trục là
// khoảng đã trôi qua của ngày logic (04:00 → bây giờ), block là record, khoảng
// trống là chưa log. Dưới thanh là mốc giờ bắt đầu + việc.
//
// Không có scroll, không bấm được - đây là ảnh chụp nhanh, muốn sửa thì sang
// History.
// -----------------------------------------------------------------------------

const hhmm = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Hai nhãn phải cách nhau chừng này % bề ngang, không thì chữ chồng chữ. */
const LABEL_GAP_PCT = 24;

/** Qua mốc này thì nhãn neo bên phải, nếu không nó tràn ra ngoài màn hình. */
const FLIP_PCT = 76;

/** Block hẹp quá thì vẫn phải thấy được. */
const MIN_BLOCK_PCT = 0.8;

interface Block {
  key: string;
  category: Category;
  label: string;
  lane: number;
  left: number;
  width: number;
  start: number;
  abandoned: boolean;
}

export default function TodayStrip({
  today,
  activities,
  carriedIn,
  now,
}: {
  today: string;
  /** Record của ngày logic hôm nay. */
  activities: Activity[];
  /** Session tràn qua mốc 04:00 - vẽ cho liền mạch, không tính vào tổng. */
  carriedIn: Activity[];
  now: number;
}) {
  const view = useMemo(() => {
    const win = dayWindow(today);
    // Sát 04:00 thì span ~ 0 → chia cho 0. Cho tối thiểu 1 phút.
    const end = Math.min(Math.max(now, win.start + 60_000), win.end);
    const span = end - win.start;
    const pct = (ts: number) => ((ts - win.start) / span) * 100;

    const { segments, laneCount } = layoutDay([...carriedIn, ...activities], win, now);
    const { trackedH } = coverageOfDay(segments, win, now);

    const blocks: Block[] = segments.map((s) => {
      const left = Math.min(100, Math.max(0, pct(s.start)));
      const right = Math.min(100, pct(Math.min(s.end, end)));
      return {
        key: s.activity.id,
        category: s.activity.category,
        label: s.activity.label?.trim() || CATEGORY_LABEL[s.activity.category],
        lane: s.lane,
        left,
        width: Math.min(100 - left, Math.max(MIN_BLOCK_PCT, right - left)),
        start: s.start,
        abandoned: s.activity.status === 'abandoned',
      };
    });

    // Nhãn: đi từ trái sang, cái nào sát cái trước thì bỏ - thanh vẫn còn đó,
    // chỉ là không có chữ.
    const sorted = [...blocks].sort((a, b) => a.left - b.left);
    const ticks: Block[] = [];
    let lastPct = -Infinity;
    for (const b of sorted) {
      if (b.left - lastPct < LABEL_GAP_PCT) continue;
      lastPct = b.left;
      ticks.push(b);
    }

    return { blocks, ticks, laneCount, trackedMs: trackedH * 3_600_000, span };
  }, [today, activities, carriedIn, now]);

  if (view.blocks.length === 0) return null;

  const logged = formatDuration(view.trackedMs);
  const elapsed = formatDuration(view.span);

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink-soft">Today</h2>
        <p className="text-[11px] tabular-nums text-ink-muted">
          {logged} logged · {elapsed} elapsed
        </p>
      </div>

      <div
        className="relative h-5 w-full overflow-hidden rounded-md bg-surface-2"
        role="img"
        aria-label={`${logged} logged out of ${elapsed} elapsed today`}
      >
        {view.blocks.map((b) => (
          <span
            key={b.key}
            className="absolute rounded-[3px]"
            style={{
              left: `${b.left}%`,
              width: `${b.width}%`,
              // Hai session chồng giờ → chia đôi chiều cao, khỏi đè lên nhau.
              top: `${(b.lane / view.laneCount) * 100}%`,
              height: `${100 / view.laneCount}%`,
              backgroundColor: CATEGORY_COLOR[b.category],
              opacity: b.abandoned ? 0.35 : 1,
            }}
          />
        ))}
      </div>

      {/* Mốc giờ + việc. Cao cố định để thanh phía trên không nhảy. */}
      <div className="relative h-7">
        {view.ticks.map((t) => {
          const flip = t.left > FLIP_PCT;
          return (
            <span
              key={t.key}
              className={`absolute top-0 flex max-w-[84px] flex-col ${
                flip ? 'items-end text-right' : 'items-start'
              }`}
              style={flip ? { right: `${100 - t.left}%` } : { left: `${t.left}%` }}
            >
              <span className="h-1 w-px bg-line" aria-hidden="true" />
              <span className="mt-0.5 text-[10px] tabular-nums text-ink-muted">
                {hhmm(t.start)}
              </span>
              <span className="w-full truncate text-[10px] text-ink-soft">{t.label}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
