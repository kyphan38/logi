'use client';

// ---------------------------------------------------------------------------
// logi — Nhận xét AI cho khoảng đang chọn (Stage 7 Task 5)
//
// Đặt DƯỚI các chart: chart trả lời "cái gì", phần này trả lời "nên để ý gì".
// Dùng đúng range của Stage 5, không có picker riêng.
//
// Quy ước hiển thị:
//   - `severity` chỉ đổi độ đậm của nhãn. KHÔNG dùng màu đỏ, không cảnh báo
//   - Tap `metric` → hiện số gốc trong digest, để đối chiếu với chart
//   - Nút preset chỉ mở màn Targets với gợi ý; không bao giờ tự áp dụng
// ---------------------------------------------------------------------------
import Link from 'next/link';
import { useState } from 'react';

import { useInsight } from '@/hooks/useInsight';
import { extremeNote, type Digest } from '@/lib/digest';
import { lookupMetric, type Observation } from '@/lib/insight-sanitize';
import { rangeLabel, type Range } from '@/lib/range';
import { PRESETS, type Activity, type Category, type PresetId } from '@/types/logi';

interface Props {
  activities: Activity[];
  range: Range;
  weekTargets: Map<string, Record<Category, number>>;
  now: number;
}

export default function InsightPanel({ activities, range, weekTargets, now }: Props) {
  const { state, gate, result, digest, generatedAt, error, run } = useInsight({
    activities,
    range,
    weekTargets,
    now,
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-medium text-ink-soft">Worth noting</h2>

      {!gate.ok ? (
        <Blocked reason={gate.reason ?? ''} hint={gate.hint} />
      ) : state === 'idle' ? (
        <button
          type="button"
          onClick={() => run()}
          className="flex w-full flex-col items-start gap-0.5 rounded-md border border-line-strong bg-surface-1 px-4 py-3 text-left transition active:scale-[0.99]"
        >
          <span className="text-sm font-medium text-ink">✦ Analyse this period</span>
          <span className="text-[13px] text-ink-muted">
            {rangeLabel(range)} · {dayWord(range)}
          </span>
        </button>
      ) : state === 'loading' ? (
        <Loading />
      ) : state === 'error' ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-surface-1 p-3">
          <p className="min-w-0 text-[13px] text-ink-soft">
            {error ?? 'Could not analyse right now.'}
          </p>
          <button
            type="button"
            onClick={() => run(true)}
            className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      ) : (
        <Result
          result={result}
          digest={digest}
          generatedAt={generatedAt}
          onRefresh={() => run(true)}
        />
      )}
    </section>
  );
}

function dayWord(range: Range): string {
  const ms = new Date(`${range.to}T12:00`).getTime() - new Date(`${range.from}T12:00`).getTime();
  const n = Math.round(ms / 86_400_000) + 1;
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

// ------------------------------------------------------------

function Blocked({ reason, hint }: { reason: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed border-line-strong px-4 py-4">
      <p className="text-[13px] text-ink-soft">{reason}</p>
      {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-4" aria-busy="true">
      <p className="text-[13px] text-ink-muted">Reading your week…</p>
      <div className="flex animate-pulse flex-col gap-2">
        <div className="h-3 w-2/5 rounded-sm bg-surface-2" />
        <div className="h-3 w-full rounded-sm bg-surface-2" />
        <div className="h-3 w-4/5 rounded-sm bg-surface-2" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------

const WEIGHT: Record<Observation['severity'], string> = {
  important: 'font-semibold text-ink',
  notable: 'font-medium text-ink',
  info: 'font-medium text-ink-soft',
};

function Result({
  result,
  digest,
  generatedAt,
  onRefresh,
}: {
  result: import('@/lib/insight-sanitize').InsightResult | null;
  digest: Digest | null;
  generatedAt: number | null;
  onRefresh: () => void;
}) {
  if (!result) return null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-1 p-4">
      {result.note && <p className="text-sm text-ink-soft">{result.note}</p>}

      {result.observations.map((o, i) => (
        <ObservationRow key={`${o.title}-${i}`} o={o} digest={digest} />
      ))}

      {result.positive && (
        <p className="text-[13px] text-ink-soft">{result.positive}</p>
      )}

      {/* Dòng của code, không phải của AI — chỉ hiện khi số quá lệch. */}
      {digest && extremeNote(digest) && (
        <p className="text-[13px] text-ink-soft">{extremeNote(digest)}</p>
      )}

      {result.suggestion && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm text-ink">Try: {result.suggestion.text}</p>
          {result.suggestion.preset && <PresetLink id={result.suggestion.preset} />}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[11px] text-ink-muted">
          {generatedAt ? `Generated ${stampOf(generatedAt)}` : ''}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink-soft transition active:scale-[0.98]"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function ObservationRow({ o, digest }: { o: Observation; digest: Digest | null }) {
  const [open, setOpen] = useState(false);
  const hit = digest && o.metric ? lookupMetric(digest, o.metric) : null;

  return (
    <div className="flex flex-col gap-1">
      <p className={`text-sm ${WEIGHT[o.severity]}`}>{o.title}</p>
      <p className="text-[13px] leading-relaxed text-ink-soft">{o.body}</p>
      {hit && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="self-start text-[11px] text-ink-muted underline decoration-dotted underline-offset-4"
        >
          {open ? `${hit.path} = ${format(hit.value)}` : o.metric}
        </button>
      )}
    </div>
  );
}

function PresetLink({ id }: { id: PresetId }) {
  return (
    <Link
      href={`/targets?suggest=${id}`}
      className="self-start rounded-sm border border-line px-3 py-1.5 text-[13px] text-ink transition active:scale-[0.98]"
    >
      Switch to {PRESETS[id].label}
    </Link>
  );
}

/** Số gốc trong digest, hiện y nguyên — đây là bước đối chiếu, không làm đẹp. */
function format(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function stampOf(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
