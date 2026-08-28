'use client';

// ============================================================
// logi — Máy nghe chưa rõ thì hỏi lại đúng MỘT câu (Task 5).
// Bấm một lựa chọn → gửi lại cho parser → hiện card xác nhận.
// Hỏi vòng hai là người dùng bỏ dùng voice, nên không có vòng hai.
// ============================================================

const BTN =
  'min-h-11 rounded-md border border-zinc-200 px-4 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 dark:border-zinc-700';

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
  /** Chọn xong thì hỏi parser lần cuối, không hỏi lại người dùng nữa. */
  onPick: (option: string) => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      role="group"
      aria-label="Clarify voice entry"
    >
      <h2 className="text-base font-semibold tracking-tight">{question}</h2>

      {transcript ? (
        <p className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-400">“{transcript}”</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            onClick={() => onPick(o)}
            className={`${BTN} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}
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
