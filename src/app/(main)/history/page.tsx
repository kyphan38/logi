'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import DateStrip from '@/components/DateStrip';
import RecordSheet, { restoreActivity, type SheetTarget } from '@/components/RecordSheet';
import Timeline from '@/components/Timeline';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import { useDayActivities, useRecentDates, useTick, useToasts } from '@/hooks/useActivities';
import { logicalDate } from '@/lib/balance';
import { roundDown } from '@/lib/datetime';
import { addDays, coverageOfDay, dayWindow, layoutDay, HOUR_PX } from '@/lib/timeline';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL } from '@/types/logi';

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
  const hasData = useRecentDates(addDays(today, -30));
  const { toasts, push, dismiss } = useToasts();

  const win = useMemo(() => dayWindow(selected), [selected]);
  // Vẽ cả record kéo sang từ hôm trước; `totals` vẫn chỉ tính `activities`.
  const { segments, laneCount } = useMemo(
    () => layoutDay([...carriedIn, ...activities], win, nowMinute),
    [carriedIn, activities, win, nowMinute],
  );
  const { trackedH, untrackedH, gaps } = useMemo(
    () => coverageOfDay(segments, win, nowMinute),
    [segments, win, nowMinute],
  );

  const bars = useMemo(() => {
    const sum = CATEGORIES.reduce((s, c) => s + (totals[c] ?? 0), 0);
    if (sum <= 0) return [];
    return CATEGORIES.filter((c) => (totals[c] ?? 0) > 0).map((c) => ({
      c,
      pct: ((totals[c] ?? 0) / sum) * 100,
    }));
  }, [totals]);

  // Mở ra là thấy 06:00 — khỏi phải cuộn qua khoảng đêm trống.
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const top =
      el.getBoundingClientRect().top +
      window.scrollY +
      2 * HOUR_PX -
      (headerRef.current?.offsetHeight ?? 0) -
      8;
    window.scrollTo({ top: Math.max(0, top) });
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
          <DateStrip today={today} selected={selected} hasData={hasData} onSelect={setSelected} />
        </div>

        <p className="mt-3 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          Tracked {trackedH.toFixed(1)}h · Untracked {untrackedH.toFixed(1)}h · Overlap{' '}
          {overlap.toFixed(1)}h
        </p>

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
        {!loading && segments.length === 0 ? (
          <p className="pb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing logged this day.
          </p>
        ) : null}

        <Timeline
          segments={segments}
          laneCount={laneCount}
          gaps={gaps}
          win={win}
          now={nowMinute}
          onSelect={(a) => setSheet({ mode: 'edit', activity: a })}
        />
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
