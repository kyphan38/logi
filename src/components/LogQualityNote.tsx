'use client';

// ---------------------------------------------------------------------------
// logi - Log quality & overlap (Stage 5 Task 6, revised in
// AMENDMENT-remove-sleep section 3.2)
//
// Placed BEFORE the charts, not after. With sparse logs, "Learn short by 12h"
// means nothing: you may have studied and forgotten to tap. The reader needs
// to know that before trusting any number below.
//
// This box used to show a ratio against 24h/day. With Sleep gone the plan is
// only 89h/168h = 53%, so even perfect logging raised an alarm - now it shows
// three raw numbers, each one checkable.
// ---------------------------------------------------------------------------

import Card from '@/components/Card';
import { isThin, logQualityLine, thinWarning, type LogQuality } from '@/lib/log-quality';

interface Props {
  quality: LogQuality;
  /** Hours counted twice. */
  overlap: number;
}

export default function LogQualityNote({ quality, overlap }: Props) {
  const thin = isThin(quality);

  return (
    <Card title="Log quality">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] tabular-nums text-ink">{logQualityLine(quality)}</span>
        {overlap > 0.05 && (
          <span
            className="text-[13px] tabular-nums text-ink-muted"
            title="Time counted in two categories at once (e.g. Work while Learning)."
          >
            Overlap {overlap.toFixed(1)}h
          </span>
        )}
      </div>

      {thin && (
        <p className="whitespace-pre-line text-[13px] text-ink-soft">{thinWarning(quality)}</p>
      )}
    </Card>
  );
}
