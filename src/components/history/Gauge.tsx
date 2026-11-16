'use client';


import { gaugeShape, gaugeNote, hours, type DayLine } from '@/lib/day-target';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/types/logi';

/**
 * One gauge cell: label / bar / number (/ note). The bar is 6px tall, no border.
 * On a planned week the target is hours left / days left, so it moves daily.
 */
export default function Gauge({ line, showNote }: { line: DayLine; showNote: boolean }) {
  const { category: c, actual, target } = line;
  const h = hours;

  const { fill, over, noTarget, dim } = gaugeShape(actual, target);
  const note = gaugeNote(line);

  return (
    <div className={`min-w-0 ${dim ? 'opacity-40' : ''}`}>
      <p className="truncate text-[10px] tracking-[-0.01em] text-ink-soft">{CATEGORY_LABEL[c]}</p>

      {noTarget ? (
        // "no bar" - still reserves the same height so the 4 columns line up.
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
          {/* Over target: a strong ink tick at the right edge. Never recolor the
              whole bar - going over on Learn is good, do not paint it red. */}
          {over ? <span className="absolute inset-y-0 right-0 w-[3px] bg-ink" /> : null}
        </div>
      )}

      {/* The number also says where you stand against the plan, no need to read
          the bar closely: nothing logged → gray; over plan → bold (with the ink
          tick at the bar's edge); short → normal. Gray only, per DESIGN.md. */}
      <p className="mt-1 truncate text-[11px] tabular-nums">
        <span
          className={
            actual <= 0
              ? 'text-ink-muted'
              : over
                ? 'font-semibold text-ink'
                : 'text-ink'
          }
        >
          {h(actual)}
        </span>
        <span className="text-ink-muted">/{noTarget ? '-' : h(target)}</span>
      </p>

      {/* Empty cells still take the space when shown, so the 4 columns line up. */}
      {showNote ? (
        <p className="mt-0.5 h-3.5 truncate text-[10px] tabular-nums text-ink-muted">{note}</p>
      ) : null}
    </div>
  );
}
