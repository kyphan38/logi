'use client';

// ---------------------------------------------------------------------------
// logi — Khôi phục từ file backup (Stage 6 Task 3)
//
// Trang ẩn: không có trong thanh điều hướng, phải gõ /settings/restore. Đây là
// việc làm một lần khi có sự cố, không phải việc hằng ngày, và một nút "import"
// đặt cạnh các nút thường dùng là một nút chờ để bị bấm nhầm.
//
// Nguyên tắc: CHỈ THÊM. Không ghi đè, không xoá. Xem `src/lib/backup.ts`.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import { listAllIds, restoreActivities } from '@/lib/activities';
import {
  parseBackup,
  planRestore,
  previewBackup,
  RESTORE_WORD,
  type BackupFile,
  type RestorePlan,
  type RestorePreview,
} from '@/lib/backup';

interface Loaded {
  file: BackupFile;
  preview: RestorePreview;
  plan: RestorePlan;
}

export default function RestorePage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  async function pickFile(file: File) {
    setError(null);
    setDone(null);
    setLoaded(null);
    setWord('');

    const { file: parsed, error: parseError } = parseBackup(await file.text());
    if (!parsed) {
      setError(parseError);
      return;
    }

    if (!uid) return;
    setBusy(true);
    try {
      // Đối chiếu với dữ liệu đang có NGAY LÚC NÀY, để con số trong preview
      // đúng là số record sẽ được thêm, không phải số record trong file.
      const existing = await listAllIds(uid);
      setLoaded({
        file: parsed,
        preview: previewBackup(parsed),
        plan: planRestore(parsed, existing),
      });
    } catch {
      setError('Could not read your current data. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!uid || !loaded) return;
    setBusy(true);
    setError(null);
    try {
      const added = await restoreActivities(uid, loaded.plan.add);
      setDone({ added, skipped: loaded.preview.records - added });
      setLoaded(null);
      setWord('');
    } catch {
      setError('Restore failed. Nothing was deleted — you can try again.');
    } finally {
      setBusy(false);
    }
  }

  const ready = loaded !== null && word.trim().toUpperCase() === RESTORE_WORD && !busy;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Restore</h1>
        <p className="text-[13px] text-ink-muted">
          Load a JSON backup. Only missing records are added — nothing is
          overwritten or deleted.
        </p>
        <Link href="/settings" className="text-[13px] text-ink-soft underline">
          Back to Settings
        </Link>
      </header>

      <label className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-line-strong bg-surface-1 p-4 text-center">
        <span className="text-sm font-medium text-ink">Choose backup file</span>
        <span className="text-[13px] text-ink-muted">The .json file from Export</span>
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Reset để chọn lại đúng file đó lần nữa vẫn kích hoạt onChange.
            e.target.value = '';
            if (f) void pickFile(f);
          }}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {done && (
        <div className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-1 p-4">
          <p className="text-sm text-ink">
            Added {done.added} {done.added === 1 ? 'record' : 'records'}. Skipped{' '}
            {done.skipped} already there.
          </p>
          <Link href="/history" className="text-[13px] text-ink-soft underline">
            Open History
          </Link>
        </div>
      )}

      {loaded && (
        <div className="flex flex-col gap-4 rounded-md border border-line-strong bg-surface-1 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">In this file</span>
            <p className="text-sm tabular-nums text-ink">
              {loaded.preview.records} records · {loaded.preview.weeks} weeks
            </p>
            <p className="text-[13px] tabular-nums text-ink-muted">
              {loaded.preview.from} → {loaded.preview.to}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">Will add</span>
            <p className="text-sm tabular-nums text-ink">
              {loaded.plan.add.length} new · {loaded.plan.skip} already there
            </p>
            {/* Target trong file chỉ có số giờ, thiếu preset và sổ nợ, nên dựng
                lại sẽ ra tuần nửa vời. Để người dùng tự đặt lại ở màn Targets. */}
            {loaded.preview.targets > 0 && (
              <p className="text-[13px] text-ink-muted">
                {loaded.preview.targets} week targets in the file are not restored.
              </p>
            )}
          </div>

          {loaded.plan.add.length === 0 ? (
            <p className="text-[13px] text-ink-soft">
              Everything in this file is already here. Nothing to do.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="confirm" className="text-[13px] text-ink-soft">
                Type {RESTORE_WORD} to confirm
              </label>
              <input
                id="confirm"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm tracking-wide text-ink"
              />
              <button
                type="button"
                onClick={() => void run()}
                disabled={!ready}
                className="rounded-sm bg-ink px-4 py-2.5 text-sm font-medium text-[var(--surface-0)] transition active:scale-[0.99] disabled:opacity-40"
              >
                {busy ? 'Restoring…' : `Add ${loaded.plan.add.length} records`}
              </button>
            </div>
          )}
        </div>
      )}

      {busy && !loaded && <p className="text-[13px] text-ink-muted">Reading…</p>}
    </div>
  );
}
