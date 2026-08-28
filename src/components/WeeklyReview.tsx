'use client';

// ------------------------------------------------------------
// logi — Weekly Review (Stage 6 Task 1)
//
// Ba màn, vuốt ngang. Dùng scroll-snap của CSS, không thêm thư viện.
// Màn 1 dùng lại BalanceBars của Stage 5 — không vẽ lại chart thứ hai.
// ------------------------------------------------------------

import { useMemo, useRef, useState } from 'react';

import BalanceBars from '@/components/BalanceBars';
import { useAuth } from '@/contexts/AuthContext';
import { useInsight } from '@/hooks/useInsight';
import { useReviewData } from '@/hooks/useReview';
import { extremeNote } from '@/lib/digest';
import { lookupMetric } from '@/lib/insight-sanitize';
import { planNextWeek, weekRange } from '@/lib/review';
import { markReviewed, setupNextWeek } from '@/lib/targets';
import { addWeeks } from '@/lib/week';
import { PRESETS, type PresetId } from '@/types/logi';

const PANELS = ['Last week', 'Worth noting', 'Next week'];
const ORDER: PresetId[] = ['normal', 'crunch', 'deep_learn', 'recovery'];

interface Props {
  week: string;
  onClose: () => void;
}

export default function WeeklyReview({ week, onClose }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { summary, activities, weekTargets, now, debt, canSetNext, loading } = useReviewData(week);

  // Màn 2 mở ra là chạy luôn — người dùng không phải bấm thêm nút nào.
  // `weekRange` chốt theo `week`, không theo đồng hồ, để digest không đổi.
  const range = useMemo(() => weekRange(week), [week]);
  const insight = useInsight({ activities, range, weekTargets, now, auto: true });

  const scroller = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState(0);
  const [preset, setPreset] = useState<PresetId>('normal');
  /** AI gợi ý preset thì đánh dấu sẵn, nhưng người dùng vẫn phải bấm Confirm. */
  const [tookHint, setTookHint] = useState(false);
  const hinted = insight.result?.suggestion?.preset ?? null;
  if (hinted && !tookHint) {
    setTookHint(true);
    if (!(hinted === 'crunch' && debt.crunchLocked)) setPreset(hinted);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextWeek = addWeeks(week, 1);
  const plan = planNextWeek(week, preset, debt.balance);

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== panel) setPanel(i);
  }

  async function finish(confirm: boolean) {
    if (!uid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (confirm && canSetNext) await setupNextWeek(uid, week, preset);
      else await markReviewed(uid, week);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weekly review"
        className="relative flex w-full max-w-[var(--content-max)] flex-col gap-3 rounded-t-lg bg-surface-2 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-lg sm:pb-4"
      >
        <header className="flex items-baseline justify-between gap-2 px-4">
          <h2 className="text-base font-semibold">{summary?.title ?? 'Weekly review'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[13px] text-ink-soft transition active:scale-[0.98]"
          >
            Close
          </button>
        </header>

        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* --- Màn 1: tuần vừa rồi --- */}
          <Panel label={PANELS[0]}>
            {loading || !summary ? (
              <p className="text-[13px] text-ink-muted">Loading…</p>
            ) : (
              <>
                <BalanceBars rows={summary.rows} showDeviation />
                <p className="text-[13px] tabular-nums text-ink-muted">
                  Coverage {Math.round(summary.coverage * 100)}%
                </p>
              </>
            )}
          </Panel>

          {/* --- Màn 2: điều đáng chú ý ---
              AI chọn ra ba điều; hỏng hoặc thiếu dữ liệu thì rơi về note
              cứng của Stage 6. Màn này không bao giờ được để trống. */}
          <Panel label={PANELS[1]}>
            {insight.state === 'loading' ? (
              <p className="text-[13px] text-ink-muted">Reading your week…</p>
            ) : insight.state === 'ready' && insight.result ? (
              <InsightNotes result={insight.result} digest={insight.digest} />
            ) : (
              <>
                {summary?.notes.map((n) => (
                  <p key={n} className="text-sm text-ink">
                    {n}
                  </p>
                ))}
                {insight.state === 'error' && (
                  <button
                    type="button"
                    onClick={() => insight.run(true)}
                    className="self-start text-[13px] text-ink-muted underline decoration-dotted underline-offset-4"
                  >
                    Could not analyse. Retry
                  </button>
                )}
              </>
            )}
          </Panel>

          {/* --- Màn 3: tuần tới --- */}
          <Panel label={`Set up week ${Number(nextWeek.slice(-2))}`}>
            {canSetNext ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {ORDER.map((id) => {
                    const locked = id === 'crunch' && debt.crunchLocked;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={locked}
                        onClick={() => setPreset(id)}
                        aria-pressed={preset === id}
                        className={[
                          'rounded-full border px-3 py-1.5 text-[13px] font-medium transition active:scale-[0.98]',
                          preset === id
                            ? 'border-transparent bg-ink text-[var(--surface-0)]'
                            : 'border-line bg-surface-1 text-ink-soft',
                          locked ? 'opacity-40' : '',
                        ].join(' ')}
                      >
                        {PRESETS[id].label}
                      </button>
                    );
                  })}
                </div>

                {hinted && (
                  <p className="text-[13px] text-ink-muted">
                    Suggested: {PRESETS[hinted].label}. Change it if you disagree.
                  </p>
                )}

                <p className="text-[13px] text-ink-muted">
                  {plan.debtNote || 'No debt carried over.'}
                </p>
                {debt.crunchLocked && (
                  <p className="text-[13px] text-ink-muted">
                    Crunch is locked — debt is over the limit.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-ink-muted">
                This week is already over. Viewing only.
              </p>
            )}
          </Panel>
        </div>

        {error && <p className="px-4 text-[13px] text-ink-soft">{error}</p>}

        <div className="flex items-center justify-between gap-3 px-4">
          <div className="flex gap-1.5" aria-hidden="true">
            {PANELS.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => goTo(i)}
                className={[
                  'h-1.5 w-1.5 rounded-full transition',
                  i === panel ? 'bg-ink' : 'bg-line-strong',
                ].join(' ')}
              />
            ))}
          </div>

          {panel < 2 ? (
            <button
              type="button"
              onClick={() => goTo(panel + 1)}
              className="rounded-sm bg-ink px-4 py-2.5 text-sm font-medium text-[var(--surface-0)] transition active:scale-[0.99]"
            >
              Next
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void finish(false)}
                className="rounded-sm border border-line px-4 py-2.5 text-sm text-ink-soft transition active:scale-[0.99] disabled:opacity-40"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={saving || !canSetNext}
                onClick={() => void finish(true)}
                className="rounded-sm bg-ink px-4 py-2.5 text-sm font-medium text-[var(--surface-0)] transition active:scale-[0.99] disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cùng quy ước với InsightPanel: severity chỉ đổi độ đậm, không dùng màu đỏ. */
const WEIGHT = {
  important: 'font-semibold text-ink',
  notable: 'font-medium text-ink',
  info: 'font-medium text-ink-soft',
} as const;

function InsightNotes({
  result,
  digest,
}: {
  result: import('@/lib/insight-sanitize').InsightResult;
  digest: import('@/lib/digest').Digest | null;
}) {
  return (
    <>
      {result.note && <p className="text-sm text-ink-soft">{result.note}</p>}
      {result.observations.map((o, i) => {
        const hit = digest && o.metric ? lookupMetric(digest, o.metric) : null;
        return (
          <div key={`${o.title}-${i}`} className="flex flex-col gap-0.5">
            <p className={`text-sm ${WEIGHT[o.severity]}`}>{o.title}</p>
            <p className="text-[13px] leading-relaxed text-ink-soft">{o.body}</p>
            {hit && (
              <p className="text-[11px] tabular-nums text-ink-muted">
                {hit.path} = {typeof hit.value === 'object' ? JSON.stringify(hit.value) : String(hit.value)}
              </p>
            )}
          </div>
        );
      })}
      {result.positive && <p className="text-[13px] text-ink-soft">{result.positive}</p>}
      {digest && extremeNote(digest) && (
        <p className="text-[13px] text-ink-soft">{extremeNote(digest)}</p>
      )}
      {result.suggestion && <p className="text-sm text-ink">Try: {result.suggestion.text}</p>}
    </>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="w-full shrink-0 snap-center px-4">
      <h3 className="mb-2 text-[11px] uppercase tracking-wide text-ink-muted">{label}</h3>
      <div className="flex min-h-40 flex-col gap-3">{children}</div>
    </section>
  );
}
