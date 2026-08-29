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
import { asleepUntil, coverageOfDay, dayWindow, layoutDay } from '@/lib/timeline';
import { daySummary, gaugeShape, type DayLine } from '@/lib/day-target';
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
  // Strip vẽ đúng tuần lịch (2 → CN) chứa ngày đang chọn, mà tuần lịch trùng
  // khít với tuần logic - nên MỘT query là đủ (index `logicalWeek` có từ Stage
  // 1). Bản cũ vẽ 7 ngày gần nhất, vắt qua hai tuần nên phải query hai lần.
  const selectedWeek = useMemo(() => logicalWeek(win.start), [win]);
  const strip = useWeekActivities(selectedWeek);

  const dayBars = useMemo(() => {
    const byDate = new Map<string, Activity[]>();
    for (const a of strip.activities) {
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
  }, [strip.activities, nowMinute]);
  // Target của đúng tuần đang xem - tuần cũ có thể khác tuần này.
  const { target: weekTarget } = useWeekTarget(selectedWeek);
  // Chỉ record của ngày này thành block. Giấc ngủ kéo sang từ hôm trước KHÔNG
  // bị cắt làm hai nữa: nó hiện nguyên hàng ở ngày hôm trước, còn ở đây chỉ là
  // một dòng mảnh "Asleep until ..." (AMENDMENT sleep-boundary §3.1-3.3).
  const { segments } = useMemo(
    () => layoutDay(activities, win, nowMinute),
    [activities, win, nowMinute],
  );
  const asleep = useMemo(
    () => asleepUntil(carriedIn, win, nowMinute),
    [carriedIn, win, nowMinute],
  );
  // Đang ngủ thì ngày coi như bắt đầu lúc tỉnh dậy - không tính là untracked.
  const { trackedH, untrackedH, gaps } = useMemo(
    () => coverageOfDay(segments, win, nowMinute, asleep?.end ?? win.start),
    [segments, win, nowMinute, asleep],
  );

  // Đối chiếu với target CẢ NGÀY của đúng ngày trong tuần đó - kể cả hôm nay.
  //
  // Trước đây hôm nay được pro-rate theo giờ, nên con số target tự bò lên suốt
  // ngày: 9 giờ sáng thấy `0.0/0.4`, 10 giờ tối thấy `0.0/1.5`. Cùng một ô mà
  // đọc hai lần ra hai nghĩa thì không ai tin nó nữa. Giờ mẫu số đứng yên, chỉ
  // tử số chạy.
  const summary = useMemo(
    () => daySummary(totals, weekTarget?.weekly ?? null, logicalWeekday(win.start)),
    [totals, weekTarget, win],
  );

  // Bố cục co giãn đã bỏ khoảng đêm trống, nên không cần tự cuộn tới 06:00
  // nữa. Đổi ngày thì về đầu danh sách là đủ.
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 });
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-xl transition active:scale-[0.99] dark:border-zinc-700"
          >
            +
          </button>
        </div>

        <div className="mt-3">
          <DateStrip today={today} selected={selected} bars={dayBars} onSelect={setSelected} />
        </div>

        <SummaryGauge
          lines={summary}
          trackedH={trackedH}
          untrackedH={untrackedH}
          overlap={overlap}
        />
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
            asleep={asleep}
            onSelect={(a) => setSheet({ mode: 'edit', activity: a })}
            onSelectDay={setSelected}
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
// Dòng tóm tắt - `Learn 1.5 / 3.0 · Work 9.5 / 9.5`
//
// Chưa có weekTarget cho tuần đó (dữ liệu cũ) → quay về dòng cũ.
// ---------------------------------------------------------------------------
function SummaryGauge({
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

  // Chưa có weekTarget cho tuần đó thì daySummary trả [] - không vẽ gauge được,
  // quay về dòng chữ cũ thay vì để trống một mảng.
  if (lines.length === 0) {
    return (
      <div className="mt-3 text-xs tabular-nums text-ink-soft">
        <p>
          Tracked {h(trackedH)}h · Untracked {h(untrackedH)}h
        </p>
        {overlap > 0 ? <p className="mt-0.5 text-ink-muted">{h(overlap)}h overlap</p> : null}
      </div>
    );
  }

  const by = new Map(lines.map((l) => [l.category, l]));

  return (
    <div className="mt-3">
      <div className="grid grid-cols-5 gap-2">
        {CATEGORIES.map((c) => (
          <Gauge key={c} line={by.get(c) ?? { category: c, actual: 0, target: 0, low: false }} />
        ))}
      </div>
      {overlap > 0 ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">{h(overlap)}h overlap</p>
      ) : null}
    </div>
  );
}

/** Một ô gauge: nhãn / thanh / số. Thanh cao 6px, không viền. */
function Gauge({ line }: { line: DayLine }) {
  const { category: c, actual, target } = line;
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  const { fill, over, noTarget, dim } = gaugeShape(actual, target);

  return (
    <div className={`min-w-0 ${dim ? 'opacity-40' : ''}`}>
      <p className="truncate text-[10px] tracking-[-0.01em] text-ink-soft">{CATEGORY_LABEL[c]}</p>

      {noTarget ? (
        // "không vẽ thanh" - vẫn chừa đúng chiều cao để 5 cột thẳng hàng.
        <div className="mt-1 h-1.5" aria-hidden="true" />
      ) : (
        <div
          className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-line"
          role="img"
          aria-label={`${CATEGORY_LABEL[c]} ${h(actual)} of ${h(target)} hours`}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${fill * 100}%`, backgroundColor: CATEGORY_COLOR[c] }}
          />
          {/* Vượt target: vạch hổ phách ở mép phải. Không đổi màu cả thanh -
              vượt Learn là chuyện tốt, đừng bôi đỏ nó. */}
          {over ? <span className="absolute inset-y-0 right-0 w-[3px] bg-amber-500" /> : null}
        </div>
      )}

      {/* Con số cũng nói luôn tình trạng so với kế hoạch, khỏi phải nhìn kỹ
          thanh: chưa log gì → xám; vượt kế hoạch → hổ phách (đúng màu vạch ở
          mép thanh); còn thiếu → chữ thường. Không có đỏ. */}
      <p className="mt-1 truncate text-[11px] tabular-nums">
        <span
          className={
            actual <= 0
              ? 'text-ink-muted'
              : over
                ? 'font-medium text-amber-600 dark:text-amber-500'
                : 'text-ink'
          }
        >
          {h(actual)}
        </span>
        <span className="text-ink-muted">/{noTarget ? '-' : h(target)}</span>
      </p>
    </div>
  );
}
