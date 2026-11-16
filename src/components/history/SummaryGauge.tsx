'use client';


import { gaugeNote, type DayLine } from '@/lib/day-target';
import { CATEGORIES } from '@/types/logi';
import Gauge from '@/components/history/Gauge';

export default function SummaryGauge({
  lines,
  trackedH,
  gapH,
  overlap,
}: {
  lines: DayLine[];
  trackedH: number;
  gapH: number;
  overlap: number;
}) {
  const h = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  // No weekTarget for that week → daySummary returns [] - no gauges to draw,
  // so fall back to the old text line instead of an empty row.
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
  // The note row shows only when some cell has a note, so a normal day is
  // just label, bar and number.
  const anyNote = lines.some((l) => gaugeNote(l) !== '');

  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((c) => (
          <Gauge
            key={c}
            showNote={anyNote}
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
      {overlap > 0 ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">{h(overlap)}h overlap</p>
      ) : null}
    </div>
  );
}
