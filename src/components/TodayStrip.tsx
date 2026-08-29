'use client';

import { useMemo } from 'react';
import { dayGaps, dayWindow, layoutDay } from '@/lib/timeline';
import { formatDuration } from '@/lib/datetime';
import { CATEGORY_COLOR, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

// -----------------------------------------------------------------------------
// logi - Thanh ngang "hôm nay" trên màn Now (Stage 4.6)
//
// Cùng dữ liệu với Timeline của History, nhưng nằm ngang và cao 24px: block là
// record, khoảng trống là chưa log. Trong block là số giờ; dưới thanh là mốc
// bắt đầu + việc, kèm giờ kết thúc khi sau đó không có gì được log.
//
// Trục bắt đầu từ record ĐẦU TIÊN của ngày, không phải 04:00 (AMENDMENT
// sleep-boundary). Giấc ngủ đêm qua thuộc về ngày hôm trước, nên nó không được
// vẽ ở đây - vẽ thì thanh sẽ nói "sleep 04:00 → 06:15", đúng thứ mà History đã
// bỏ. Ngày ở màn này bắt đầu khi người dùng bắt đầu làm gì đó, nên "elapsed" là
// khoảng từ record đầu tiên tới bây giờ. Con số coverage đầy đủ của ngày logic
// nằm ở History.
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

/**
 * Chữ trong block chỉ vẽ khi block đủ rộng. Ước lượng theo màn hẹp nhất
 * (~330px): mỗi ký tự 10px ăn chừng 1.6% bề ngang, cộng 3% cho padding hai
 * bên. Thà không hiện còn hơn hiện một nửa chữ.
 */
const fitsInside = (text: string, widthPct: number) => widthPct >= text.length * 1.6 + 3;

/**
 * Chữ trên nền màu category. Năm màu đều là tông giữa nên không có một màu chữ
 * nào đúng cho cả năm: amber/emerald sáng → chữ đen, còn lại → chữ trắng.
 * Luminance thô (bỏ gamma) là đủ để chia hai nhóm.
 */
function inkOn(hex: string): string {
  const v = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const l = 0.2126 * v(1) + 0.7152 * v(3) + 0.0722 * v(5);
  return l > 0.5 ? '#1a1a1a' : '#ffffff';
}

interface Block {
  key: string;
  category: Category;
  label: string;
  duration: string;
  lane: number;
  left: number;
  width: number;
  start: number;
  /** Số giờ nằm vừa trong block hay phải xuống dưới thanh. */
  showInside: boolean;
  /** Giờ dừng - chỉ đặt khi sau block không còn gì được log. */
  stoppedAt: number | null;
  abandoned: boolean;
}

export default function TodayStrip({
  today,
  activities,
  now,
}: {
  today: string;
  /** Record của ngày logic hôm nay. Không gồm giấc ngủ tràn từ hôm trước. */
  activities: Activity[];
  now: number;
}) {
  const view = useMemo(() => {
    const win = dayWindow(today);
    const { segments, laneCount } = layoutDay(activities, win, now);

    // Ngày ở đây bắt đầu từ record đầu tiên. layoutDay đã sắp theo giờ bắt đầu.
    const dayStart = segments.length > 0 ? segments[0].start : win.start;
    // Record vừa mới bắt đầu thì span ~ 0 → chia cho 0. Cho tối thiểu 1 phút.
    const end = Math.min(Math.max(now, dayStart + 60_000), win.end);
    const span = end - dayStart;
    const pct = (ts: number) => ((ts - dayStart) / span) * 100;

    // dayGaps() cũng lấy mốc từ record đầu tiên: khoảng trước nó không phải
    // "chưa log", nó nằm ngoài ngày mà thanh này đang kể.
    const { trackedH, gaps } = dayGaps(segments, win, now);

    // Mỗi khoảng trống bắt đầu tại đúng lúc ngừng log.
    const stops = gaps.filter((g) => g.start > dayStart).map((g) => g.start);
    const stopAt = (ts: number) => stops.find((s) => Math.abs(s - ts) < 60_000) ?? null;

    const blocks: Block[] = segments.map((s) => {
      const left = Math.min(100, Math.max(0, pct(s.start)));
      const right = Math.min(100, pct(Math.min(s.end, end)));
      const width = Math.min(100 - left, Math.max(MIN_BLOCK_PCT, right - left));
      const duration = formatDuration(s.end - s.start);
      return {
        key: s.activity.id,
        category: s.activity.category,
        label: s.activity.label?.trim() || CATEGORY_LABEL[s.activity.category],
        duration,
        lane: s.lane,
        left,
        width,
        start: s.start,
        // Chồng lane → mỗi lane chỉ còn 12px, nhét chữ vào là bẹp.
        showInside: laneCount === 1 && fitsInside(duration, width),
        stoppedAt: stopAt(s.end),
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

    return {
      blocks,
      ticks,
      laneCount,
      trackedMs: trackedH * 3_600_000,
      dayStart,
      span,
      hasStop: ticks.some((t) => t.stoppedAt !== null),
    };
  }, [today, activities, now]);

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
        className="relative h-6 w-full overflow-hidden rounded-md bg-surface-2"
        role="img"
        aria-label={`${logged} logged out of ${elapsed} since ${hhmm(view.dayStart)}`}
      >
        {view.blocks.map((b) => (
          <span
            key={b.key}
            className="absolute flex items-center justify-center overflow-hidden rounded-[3px]"
            style={{
              left: `${b.left}%`,
              width: `${b.width}%`,
              top: `${(b.lane / view.laneCount) * 100}%`,
              height: `${100 / view.laneCount}%`,
              backgroundColor: CATEGORY_COLOR[b.category],
              opacity: b.abandoned ? 0.35 : 1,
            }}
          >
            {b.showInside ? (
              <span
                className="truncate px-1 text-[10px] leading-none font-medium tabular-nums"
                style={{ color: inkOn(CATEGORY_COLOR[b.category]) }}
              >
                {b.duration}
              </span>
            ) : null}
          </span>
        ))}
      </div>

      {/* Mốc giờ + việc. Cao cố định để thanh phía trên không nhảy. */}
      <div className={`relative ${view.hasStop ? 'h-10' : 'h-7'}`}>
        {view.ticks.map((t) => {
          const flip = t.left > FLIP_PCT;
          return (
            <span
              key={t.key}
              className={`absolute top-0 flex max-w-[92px] flex-col ${
                flip ? 'items-end text-right' : 'items-start'
              }`}
              style={flip ? { right: `${100 - t.left}%` } : { left: `${t.left}%` }}
            >
              <span className="h-1 w-px bg-line" aria-hidden="true" />
              <span className="mt-0.5 text-[10px] tabular-nums text-ink-muted">
                {/* Block hẹp không chứa nổi số giờ → để nó ở đây, đừng mất. */}
                {hhmm(t.start)}
                {t.showInside ? '' : ` · ${t.duration}`}
              </span>
              <span className="w-full truncate text-[10px] text-ink-soft">{t.label}</span>
              {/* Giờ dừng: chỉ hiện khi sau đó không log gì nữa - nếu có việc
                  kế tiếp thì giờ bắt đầu của nó đã nói rồi. */}
              {t.stoppedAt !== null ? (
                <span className="text-[10px] tabular-nums text-ink-muted">
                  → {hhmm(t.stoppedAt)}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}
