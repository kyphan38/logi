'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import DateStrip, { type DayBar } from '@/components/DateStrip';
import DayBedtimeSheet from '@/components/DayBedtimeSheet';
import RecordSheet, { restoreActivity, type SheetTarget } from '@/components/RecordSheet';
import Timeline from '@/components/Timeline';
import Toasts from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import {
  capWait,
  useDayActivities,
  useTick,
  useToasts,
  useWeekActivities,
} from '@/hooks/useActivities';
import { actualHours, logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import { roundDown } from '@/lib/datetime';
import { dayGaps, dayWindow, layoutDay } from '@/lib/timeline';
import { daySummary, gaugeShape, type DayLine } from '@/lib/day-target';
import { useWeekTarget } from '@/hooks/useTargets';
import { bedtimeDate, logBedtime, useDayLog } from '@/hooks/useBedtime';
import { clearBedtime } from '@/lib/bedtime-store';
import { formatBedtime } from '@/lib/bedtime';
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
  const { activities, totals, overlap, loading } = useDayActivities(selected);
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
  // Chỉ record của ngày này thành block. Session vắt qua nửa đêm không bị cắt:
  // nó hiện nguyên khối ở ngày logic của `startAt`.
  const { segments } = useMemo(
    () => layoutDay(activities, win, nowMinute),
    [activities, win, nowMinute],
  );
  // Khoảng trống chỉ tính GIỮA activity đầu và cuối (mục 6): hai đầu ngày không
  // còn ai log nữa nên không thể gọi là "quên log".
  const { trackedH, gapH, gaps } = useMemo(
    () => dayGaps(segments, win, nowMinute),
    [segments, win, nowMinute],
  );

  // Giờ đã log ở các ngày TRƯỚC ngày đang xem, trong cùng tuần logic. Đây là
  // đầu vào của gợi ý bù: thứ Hai học 10h thì thứ Ba phải biết điều đó.
  //
  // Cố tình không cộng giờ của chính ngày đang xem. Cộng vào thì mẫu số tụt dần
  // suốt ngày trong lúc mình đang đuổi theo nó - nhìn hai lần ra hai đích.
  const doneBefore = useMemo(() => {
    if (strip.loading) return null;
    const out = actualHours(
      strip.activities.filter((a) => logicalDate(a.startAt) < selected),
      nowMinute,
    );
    return out;
  }, [strip.loading, strip.activities, selected, nowMinute]);

  // Đối chiếu với gợi ý của đúng ngày đó. Mẫu số chốt lúc 04:00 và đứng yên cả
  // ngày - chỉ tử số chạy. Trước đây hôm nay được pro-rate theo giờ nên target
  // tự bò lên: 9 giờ sáng thấy `0.0/0.4`, 10 giờ tối thấy `0.0/1.5`. Cùng một ô
  // mà đọc hai lần ra hai nghĩa thì không ai tin nó nữa.
  const summary = useMemo(
    () => daySummary(totals, weekTarget?.weekly ?? null, logicalWeekday(win.start), doneBefore),
    [totals, weekTarget, win, doneBefore],
  );

  // Bố cục co giãn đã bỏ khoảng đêm trống, nên không cần tự cuộn tới 06:00
  // nữa. Đổi ngày thì về đầu danh sách là đủ.
  // Bedtime nằm ở `dayLogs`, không phải activity, nên `useDayActivities` không
  // kéo nó về - đó là lý do History trước giờ không thấy mốc đã ghi ở Now.
  //
  // Khoá theo NGÀY LOGIC: `setBedtime` lưu bằng `logicalDate(at)` nên đêm 02:00
  // thứ Bảy đã nằm sẵn ở thứ Sáu. Ở đây chỉ đọc lại đúng khoá đó, không tự lùi
  // ngày lần nữa - lùi hai lần thì mốc rơi về thứ Năm.
  const { log: bedtimeLog } = useDayLog(selected);

  // --- Sửa bedtime của ngày đang xem --------------------------------------
  // Sheet bên Now chỉ với được hai đêm gần nhất, nên quên ghi ba đêm là mốc đó
  // mất luôn. History đã có sẵn ngày đang chọn - chỗ tự nhiên nhất để ghi bù.
  const [bedtimeOpen, setBedtimeOpen] = useState(false);
  const [bedtimeBusy, setBedtimeBusy] = useState(false);

  /** Undo dùng chung cho ghi và xoá: có mốc cũ thì trả lại, không thì xoá. */
  function restoreBedtime(date: string, prev: number | null) {
    if (!uid) return;
    const back = prev === null ? clearBedtime(uid, date) : logBedtime(uid, prev);
    void back.catch((e) => push(`Could not undo. ${(e as Error).message}`));
  }

  /**
   * Mốc cũ của đêm sắp ghi đè, để Undo trả lại đúng cái cũ chứ không xoá trắng.
   * Chỉ biết mốc của ngày ĐANG XEM; `at` luôn rơi vào chính ngày đó, nhưng nếu
   * lệch thì thà nhận `null` còn hơn trả lại một con số của đêm khác.
   */
  function bedtimeOf(date: string): number | null {
    return date === bedtimeLog.date ? bedtimeLog.bedtimeAt : null;
  }

  async function handleBedtime(at: number) {
    if (!uid || bedtimeBusy) return;
    setBedtimeOpen(false);
    setBedtimeBusy(true);
    const date = bedtimeDate(at);
    const prev = bedtimeOf(date);
    try {
      await capWait(logBedtime(uid, at), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`Bedtime ${formatBedtime(at)} logged for ${prettyDate(date)}.`, {
        label: 'Undo',
        run: () => restoreBedtime(date, prev),
      });
    } catch (e) {
      push(`Could not log bedtime. ${(e as Error).message}`);
    } finally {
      setBedtimeBusy(false);
    }
  }

  async function handleClearBedtime(date: string) {
    if (!uid || bedtimeBusy) return;
    setBedtimeOpen(false);
    setBedtimeBusy(true);
    const prev = bedtimeOf(date);
    try {
      await capWait(clearBedtime(uid, date), (e) => push(`Sync failed. ${(e as Error).message}`));
      push(`Bedtime cleared for ${prettyDate(date)}.`, {
        label: 'Undo',
        run: () => restoreBedtime(date, prev),
      });
    } catch (e) {
      push(`Could not clear bedtime. ${(e as Error).message}`);
    } finally {
      setBedtimeBusy(false);
    }
  }

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
          {/* Bedtime đứng cùng hàng với nút +, KHÔNG nối vào dòng ngày: dòng đó
              có `truncate`, nên "Wednesday, Sep 24" hơi dài là mốc giờ bị cắt
              mất. Cùng cỡ chữ và cùng token màu với nút 🌙 bên màn Now để hai
              trang đọc ra một thứ giống nhau.
              Đêm chưa ghi vẫn hiện nút, chỉ mờ đi: nếu ẩn hẳn thì ngày cũ không
              còn chỗ nào bấm vào để ghi bù - mà đó chính là việc người ta mở
              History lên để làm. */}
          <button
            type="button"
            onClick={() => setBedtimeOpen(true)}
            disabled={bedtimeBusy}
            aria-label={
              bedtimeLog.bedtimeAt === null
                ? `Add bedtime for ${prettyDate(selected)}`
                : `Edit bedtime for ${prettyDate(selected)}`
            }
            className={`min-h-11 shrink-0 px-1 text-xs tabular-nums transition active:scale-95 disabled:opacity-40 ${
              bedtimeLog.bedtimeAt === null
                ? 'text-zinc-300 dark:text-zinc-600'
                : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            🌙 {bedtimeLog.bedtimeAt === null ? '–' : formatBedtime(bedtimeLog.bedtimeAt)}
          </button>
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
          gapH={gapH}
          overlap={overlap}
          today={selected === today}
          planned={doneBefore !== null}
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
            onSelect={(a) => setSheet({ mode: 'edit', activity: a })}
            onAdd={() => setSheet(newRecordDefaults(selected, today, nowMinute))}
          />
        )}
      </div>

      {bedtimeOpen && uid ? (
        <DayBedtimeSheet
          // Đổi ngày trong lúc sheet mở thì dựng lại từ đầu, nếu không ô giờ
          // vẫn giữ giá trị của đêm cũ.
          key={selected}
          date={selected}
          log={bedtimeLog}
          busy={bedtimeBusy}
          onPick={(at) => void handleBedtime(at)}
          onClear={(date) => void handleClearBedtime(date)}
          onClose={() => setBedtimeOpen(false)}
        />
      ) : null}

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
  gapH,
  overlap,
  today,
  planned,
}: {
  lines: DayLine[];
  trackedH: number;
  gapH: number;
  overlap: number;
  /** Ngày đang xem là hôm nay → mới có chuyện "còn bao nhiêu". */
  today: boolean;
  /** Mẫu số là gợi ý bù, không phải chia theo baseline. */
  planned: boolean;
}) {
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  // Chưa có weekTarget cho tuần đó thì daySummary trả [] - không vẽ gauge được,
  // quay về dòng chữ cũ thay vì để trống một mảng.
  if (lines.length === 0) {
    return (
      <div className="mt-3 text-xs tabular-nums text-ink-soft">
        <p>
          {h(trackedH)}h logged{gapH > 0 ? ` · ${h(gapH)}h gaps` : ''}
        </p>
        {overlap > 0 ? <p className="mt-0.5 text-ink-muted">{h(overlap)}h overlap</p> : null}
      </div>
    );
  }

  const by = new Map(lines.map((l) => [l.category, l]));

  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((c) => (
          <Gauge
            key={c}
            today={today}
            line={
              by.get(c) ?? {
                category: c,
                actual: 0,
                target: 0,
                standard: 0,
                met: false,
                capped: false,
                low: false,
              }
            }
          />
        ))}
      </div>
      {/* Nói một lần mẫu số là gì. Không có dòng này thì con số đổi mỗi ngày mà
          không ai biết vì sao - trông như lỗi. */}
      {planned ? (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
          Đích chia phần còn lại của tuần cho những ngày chưa qua.
        </p>
      ) : null}
      {overlap > 0 ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">{h(overlap)}h overlap</p>
      ) : null}
    </div>
  );
}

/** Một ô gauge: nhãn / thanh / số / ghi chú. Thanh cao 6px, không viền. */
function Gauge({ line, today }: { line: DayLine; today: boolean }) {
  const { category: c, actual, target, met, capped } = line;
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  const { fill, over, noTarget, dim } = gaugeShape(actual, target);

  // Dòng dưới cùng. Ưu tiên: xong tuần → còn thiếu hôm nay → bị trần chặn.
  // Chỗ này luôn chừa sẵn chiều cao, nếu không 4 cột sẽ so le nhau.
  const left = target - actual;
  const note = met
    ? 'đủ tuần'
    : today && !noTarget && left > 0.05
      ? `còn ${h(left)}h`
      : capped
        ? 'chạm trần'
        : '';

  return (
    <div className={`min-w-0 ${dim ? 'opacity-40' : ''}`}>
      <p className="truncate text-[10px] tracking-[-0.01em] text-ink-soft">{CATEGORY_LABEL[c]}</p>

      {noTarget ? (
        // "không vẽ thanh" - vẫn chừa đúng chiều cao để 4 cột thẳng hàng.
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

      {/* Luôn chiếm chỗ, kể cả khi rỗng - 4 cột phải thẳng chân nhau. */}
      <p className="mt-0.5 h-3.5 truncate text-[10px] tabular-nums text-ink-muted">{note}</p>
    </div>
  );
}
