'use client';

// ---------------------------------------------------------------------------
// logi - AI notes for the selected range (Stage 7 Task 5)
//
// Placed BELOW the charts: charts answer "what", this answers "what to notice".
// Uses the same Stage 5 range, no picker of its own.
//
// Display rules:
//   - `severity` only changes the label weight. NO red, no warnings
//   - Tap `metric` → show the raw number from the digest, to check against the chart
//   - The preset button only opens Targets with a suggestion; never applies it
// ---------------------------------------------------------------------------
import Link from 'next/link';
import { useState } from 'react';

import Card from '@/components/Card';
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
    <Card title="Worth noting">
      {!gate.ok || state === 'idle' ? (
        <Analyse
          range={range}
          reason={gate.ok ? null : (gate.reason ?? '')}
          hint={gate.ok ? undefined : gate.hint}
          onRun={() => run()}
        />
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
    </Card>
  );
}

function dayWord(range: Range): string {
  const ms = new Date(`${range.to}T12:00`).getTime() - new Date(`${range.from}T12:00`).getTime();
  const n = Math.round(ms / 86_400_000) + 1;
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

// ------------------------------------------------------------

/**
 * The analysis button. When blocked the button STILL shows, just faded, with
 * the reason.
 *
 * A blocking gate used to hide the button, leaving a dashed frame - users
 * thought the app was broken and never knew the feature existed. A faded
 * button says two things at once: there is something to tap, and why not yet.
 */
function Analyse({
  range,
  reason,
  hint,
  onRun,
}: {
  range: Range;
  /** null = can open. Non-null = the blocking reason. */
  reason: string | null;
  hint?: string;
  onRun: () => void;
}) {
  const blocked = reason !== null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onRun}
        disabled={blocked}
        className={[
          'flex w-full flex-col items-start gap-0.5 rounded-md border px-4 py-3 text-left transition',
          blocked
            ? 'cursor-not-allowed border-dashed border-line-strong opacity-50'
            : 'border-line-strong bg-surface-1 active:scale-[0.99]',
        ].join(' ')}
      >
        <span className="text-sm font-medium text-ink">✦ Analyse this period</span>
        <span className="text-[13px] text-ink-muted">
          {rangeLabel(range)} · {dayWord(range)}
        </span>
      </button>

      {blocked && (
        <div className="flex flex-col gap-0.5 px-1">
          <p className="text-[13px] text-ink-soft">{reason}</p>
          {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
        </div>
      )}
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

      {/* A line from the code, not the AI - only shown when the numbers are far off. */}
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

/** Raw numbers from the digest, shown as-is - this is for checking, not for looks. */
function format(v: unknown): string {
  if (v === null || v === undefined) return '-';
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
