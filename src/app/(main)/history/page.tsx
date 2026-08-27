'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import DateStrip, { type DayBar } from '@/components/DateStrip';
import RecordSheet, { restoreActivity, type SheetTarget } from '@/components/RecordSheet';
import Timeline from '@/components/Timeline';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import {
  useDayActivities,
  useTick,
  useToasts,
  useWeekActivities,
} from '@/hooks/useActivities';
import { actualHours, logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import { roundDown } from '@/lib/datetime';
import { addDays, coverageOfDay, dayWindow, layoutDay } from '@/lib/timeline';
import { daySummary, progressFor, type DayLine } from '@/lib/day-target';
import { useWeekTarget } from '@/hooks/useTargets';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type Activity } from '@/types/logi';

function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Giờ mặc định cho record thêm tay: hôm nay → 1 tiếng vừa rồi (làm tròn 15 phút);
 * ngày cũ → 12:00–13:00 của chính ngày đang xem.
 */
function newRecordDefaults(selected: string, today: string, now: number): SheetTarget {
  if (selected === today) {
    const end = roundDown(now, 15);
    return { mode: 'create', startAt: end - 3_600_000, endAt: end };
  }
  const [y, m, d] = selected.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  return { mode: 'create', startAt: start, endAt: start + 3_600_000 };
}

export default function HistoryPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const nowMinute = useTick(60_000, true);
  const today = logicalDate(nowMinute);

  const [selected, setSelected] = useState(() => logicalDate(Date.now()));
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const { activities, carriedIn, totals, overlap, loading } = useDayActivities(selected);
  const { toasts, push, dismiss } = useToasts();

  const win = useMemo(() => dayWindow(selected), [selected]);

  // --- Day strip -----------------------------------------------------------
  // Dải 7 ngày có thể vắt qua hai tuần logic. Dùng MỘT query cho mỗi tuần
  // (index `logicalWeek` đã có từ Stage 1) rồi gom nhóm ở client — không bao
  // giờ 7 query. Đổi tuần mới query lại.
  const stripWeeks = useMemo(() => {
    const first = logicalWeek(dayWindow(addDays(today, -6)).start);
    const last = logicalWeek(dayWindow(today).start);
    return { first, last: last === first ? null : last };
  }, [today]);
  const weekA = useWeekActivities(stripWeeks.first);
  const weekB = useWeekActivities(stripWeeks.last);

  const dayBars = useMemo(() => {
    const byDate = new Map<string, Activity[]>();
    for (const a of [...weekA.activities, ...weekB.activities]) {
      const d = logicalDate(a.startAt);
      const list = byDate.get(d);
      if (list) list.push(a);
      else byDate.set(d, [a]);
    }
    const out: Record<string, DayBar[]> = {};
    for (const [d, list] of byDate) {
      // Cùng `actualHours()` với summary line → hai chỗ không thể lệch nhau.
      const h = actualHours(list, nowMinute);
      const sum = CATEGORIES.reduce((acc, c) => acc + h[c], 0);
      if (sum <= 0) continue;
      // Tỉ lệ theo tổng giờ đã log của ngày đó, không phải 24h.
      out[d] = CATEGORIES.filter((c) => h[c] > 0).map((c) => ({ c, pct: (h[c] / sum) * 100 }));
    }
    return out;
  }, [weekA.activities, weekB.activities, nowMinute]);
  // Target của đúng tuần đang xem — tuần cũ có thể khác tuần này.
  const { target: weekTarget } = useWeekTarget(logicalWeek(win.start));
  // Vẽ cả record kéo sang từ hôm trước; `totals` vẫn chỉ tính `activities`.
  const { segments } = useMemo(
    () => layoutDay([...carriedIn, ...activities], win, nowMinute),
    [carriedIn, activities, win, nowMinute],
  );
  const { trackedH, untrackedH, gaps } = useMemo(
    () => coverageOfDay(segments, win, nowMinute),
    [segments, win, nowMinute],
  );

  // Đối chiếu với target của đúng ngày trong tuần đó. Hôm nay thì pro-rate —
  // 10 giờ sáng mà so với target cả ngày thì cái gì cũng "thiếu".
  const summary = useMemo(
    () =>
      daySummary(
        totals,
        weekTarget?.weekly ?? null,
        logicalWeekday(win.start),
        progressFor(selected, today, nowMinute),
      ),
    [totals, weekTarget, win, selected, today, nowMinute],
  );

  const bars = useMemo(() => {
    const sum = CATEGORIES.reduce((s, c) => s + (totals[c] ?? 0), 0);
    if (sum <= 0) return [];
    return CATEGORIES.filter((c) => (totals[c] ?? 0) > 0).map((c) => ({
      c,
      pct: ((totals[c] ?? 0) / sum) * 100,
    }));
  }, [totals]);

  // Bố cục co giãn đã bỏ khoảng đêm trống, nên không cần tự cuộn tới 06:00
  // nữa. Đổi ngày thì về đầu danh sách là đủ.
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selected]);

  return (
    <div className="flex flex-1 flex-col">
      <header
        ref={headerRef}
        className="sticky top-0 z-30 -mx-5 border-b border-zinc-100 bg-white px-5 pb-3 pt-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">History</h1>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {prettyDate(selected)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSheet(newRecordDefaults(selected, today, nowMinute))}
            aria-label="Add record"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-xl transition active:scale-[0.99] dark:border-zinc-700"
          >
            +
          </button>
        </div>

        <div className="mt-3">
          <DateStrip today={today} selected={selected} bars={dayBars} onSelect={setSelected} />
        </div>

        <SummaryLine
          lines={summary}
          trackedH={trackedH}
          untrackedH={untrackedH}
          overlap={overlap}
        />

        <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {bars.length > 0 ? (
            bars.map((b) => (
              <span
                key={b.c}
                title={`${CATEGORY_LABEL[b.c]} ${(totals[b.c] ?? 0).toFixed(1)}h`}
                style={{ width: `${b.pct}%`, backgroundColor: CATEGORY_COLOR[b.c] }}
              />
            ))
          ) : (
            <span className="w-full bg-zinc-100 dark:bg-zinc-800" />
          )}
        </div>
      </header>

      <div ref={bodyRef} className="pt-4">
        {loading && segments.length === 0 ? (
          <p className="pb-3 text-sm text-zinc-400">Loading…</p>
        ) : (
          <Timeline
            segments={segments}
            gaps={gaps}
            win={win}
            now={nowMinute}
            onSelect={(a) => setSheet({ mode: 'edit', activity: a })}
            onAdd={() => setSheet(newRecordDefaults(selected, today, nowMinute))}
          />
        )}
      </div>

      {sheet && uid ? (
        <RecordSheet
          key={sheet.mode === 'edit' ? sheet.activity.id : 'new'}
          target={sheet}
          uid={uid}
          now={nowMinute}
          onClose={() => setSheet(null)}
          onToast={(message) => push(message)}
          onDeleted={(a) =>
            push('Record deleted.', {
              label: 'Undo',
              run: () => {
                restoreActivity(uid, a).catch((e) => push((e as Error).message));
              },
            })
          }
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dòng tóm tắt — `Learn 1.5 / 3.0 · Work 9.5 / 9.5`
//
// Chưa có weekTarget cho tuần đó (dữ liệu cũ) → quay về dòng cũ.
// ---------------------------------------------------------------------------
function SummaryLine({
  lines,
  trackedH,
  untrackedH,
  overlap,
}: {
  lines: DayLine[];
  trackedH: number;
  untrackedH: number;
  overlap: number;
}) {
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  return (
    <div className="mt-3 text-xs tabular-nums">
      {lines.length > 0 ? (
        <p className="flex flex-wrap gap-x-2 gap-y-0.5">
          {lines.map((l) => (
            <span
              key={l.category}
              // Dưới 50% target → đậm hơn một chút. Không dùng đỏ.
              className={
                l.low
                  ? 'font-medium text-zinc-600 dark:text-zinc-300'
                  : 'text-zinc-400 dark:text-zinc-500'
              }
            >
              {CATEGORY_LABEL[l.category]} {h(l.actual)} / {h(l.target)}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-zinc-500 dark:text-zinc-400">
          Tracked {h(trackedH)}h · Untracked {h(untrackedH)}h
        </p>
      )}

      {overlap > 0 ? (
        <p className="mt-0.5 text-zinc-400 dark:text-zinc-600">{h(overlap)}h overlap</p>
      ) : null}
    </div>
  );
}
