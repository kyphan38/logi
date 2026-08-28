'use client';

// ---------------------------------------------------------------------------
// logi - Sheet xuất file (Stage 5 Task 7)
//
// Tải hoàn toàn ở client bằng Blob. Không có API route: dữ liệu đã nằm sẵn
// trong máy, gửi vòng lên server rồi tải về chỉ tốn tiền và tốn thời gian.
// ---------------------------------------------------------------------------
import { useState } from 'react';

import type { AllTimeExport } from '@/hooks/useBackup';
import { exportFilename, toCsv, toJson } from '@/lib/export';
import type { Range } from '@/lib/range';
import type { Activity, Category } from '@/types/logi';

type Format = 'csv' | 'json';
type Scope = 'range' | 'all';

interface Props {
  activities: Activity[];
  range: Range;
  weekTargets: Map<string, Record<Category, number>>;
  now: number;
  onClose: () => void;
  /** Tải toàn bộ dữ liệu. Vắng mặt thì chỉ export khoảng đang xem. */
  loadAllTime?: () => Promise<AllTimeExport>;
  /** Gọi sau khi file đã tạo xong - để ghi mốc "lần export gần nhất". */
  onExported?: () => void;
}

export default function ExportSheet({
  activities,
  range,
  weekTargets,
  now,
  onClose,
  loadAllTime,
  onExported,
}: Props) {
  const [format, setFormat] = useState<Format>('csv');
  const [scope, setScope] = useState<Scope>('range');
  const [all, setAll] = useState<AllTimeExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bản đang được xuất: khoảng đang xem, hoặc toàn bộ nếu đã tải xong.
  const data =
    scope === 'all' && all ? all : { activities, range, weekTargets, debt: undefined };

  /**
   * Chỉ tải toàn bộ khi người dùng thật sự chọn, và chỉ tải một lần.
   * Sau một năm đây là vài nghìn document - không nên đọc sẵn cho vui.
   */
  async function pickAll() {
    setScope('all');
    if (all || !loadAllTime) return;
    setLoading(true);
    setError(null);
    try {
      setAll(await loadAllTime());
    } catch {
      setError('Could not load all data. Check your connection.');
      setScope('range');
    } finally {
      setLoading(false);
    }
  }

  function download() {
    const text =
      format === 'csv'
        ? toCsv(data.activities)
        : toJson(data.activities, data.range, data.weekTargets, now, data.debt);
    const type =
      format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';

    save(new Blob([text], { type }), exportFilename(data.range, format));
    onExported?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        className="relative flex w-full max-w-[var(--content-max)] flex-col gap-4 rounded-t-lg bg-surface-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-lg sm:pb-4"
      >
        <h2 className="text-base font-semibold">Export</h2>

        {loadAllTime && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
              Data
            </legend>
            <div className="flex gap-2">
              <FormatButton
                label="This range"
                hint={rangeText(range)}
                active={scope === 'range'}
                onClick={() => setScope('range')}
              />
              <FormatButton
                label="All time"
                hint="full backup"
                active={scope === 'all'}
                onClick={() => void pickAll()}
              />
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">Range</span>
          <p className="text-sm tabular-nums text-ink">
            {loading ? 'Loading…' : rangeText(data.range)}
          </p>
          <p className="text-[13px] text-ink-muted">
            {data.activities.length} {data.activities.length === 1 ? 'record' : 'records'}
            {scope === 'all' && all ? ` · ${all.weekTargets.size} weeks planned` : ''}
          </p>
          {error && (
            <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
            Format
          </legend>
          <div className="flex gap-2">
            <FormatButton
              label="CSV"
              hint="Excel, Sheets"
              active={format === 'csv'}
              onClick={() => setFormat('csv')}
            />
            <FormatButton
              label="JSON"
              hint={scope === 'all' ? 'targets + debt' : 'with targets'}
              active={format === 'json'}
              onClick={() => setFormat('json')}
            />
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-sm border border-line px-4 py-2.5 text-sm text-ink-soft transition active:scale-[0.99]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={download}
            disabled={loading || data.activities.length === 0}
            className="flex-1 rounded-sm bg-ink px-4 py-2.5 text-sm font-medium text-[var(--surface-0)] transition active:scale-[0.99] disabled:opacity-40"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

function rangeText(r: { from: string; to: string }): string {
  if (!r.from) return 'No data';
  return r.from === r.to ? r.from : `${r.from} → ${r.to}`;
}

function FormatButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex flex-1 flex-col items-start rounded-sm border px-3 py-2 text-left transition active:scale-[0.99]',
        active ? 'border-ink bg-surface-1' : 'border-line',
      ].join(' ')}
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-[11px] text-ink-muted">{hint}</span>
    </button>
  );
}

/**
 * Lưu file.
 *
 * iOS Safari không tôn trọng thuộc tính `download` trên mọi phiên bản: có máy
 * mở thẳng nội dung trong tab thay vì lưu. Vẫn thử `download` trước vì trên
 * desktop và Safari mới thì nó cho file vào app Files đúng tên; nếu trình duyệt
 * không hỗ trợ thì mở tab mới để người dùng tự bấm Share → Save to Files.
 */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  if ('download' in a) {
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }

  // Thu hồi ngay là hỏng file trên Safari - nó đọc blob sau khi hàm đã chạy xong.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
