'use client';

// ============================================================
// logi - When unsure, ask back exactly ONE question (Task 5).
// Tap a choice → send back to the parser → show the confirm card.
// A second round makes people stop using voice, so there is none.
// ============================================================

const BTN =
  'min-h-11 rounded-md border border-line-strong px-4 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50';

export default function ClarifyCard({
  question,
  options,
  transcript,
  busy,
  onPick,
  onManual,
  onCancel,
}: {
  question: string;
  options: string[];
  transcript: string | null;
  busy: boolean;
  /** After a choice, ask the parser one last time; never ask the user again. */
  onPick: (option: string) => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-line bg-surface-2 p-4"
      role="group"
      aria-label="Clarify voice entry"
    >
      <h2 className="text-base font-semibold tracking-tight">{question}</h2>

      {transcript ? (
        <p className="mt-1 text-sm italic text-ink-muted">“{transcript}”</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            onClick={() => onPick(o)}
            className={`${BTN} bg-ink text-surface-0`}
          >
            {o}
          </button>
        ))}

        <button type="button" disabled={busy} onClick={onManual} className={BTN}>
          Type it
        </button>
      </div>

      <div className="mt-4">
        <button type="button" disabled={busy} onClick={onCancel} className={`${BTN} w-full`}>
          {busy ? 'Working…' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
