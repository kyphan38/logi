// ---------------------------------------------------------------------------
// logi - Export CSV / JSON (Stage 5 Task 7)
//
// Dữ liệu là của người dùng. Xuất được ra file nghĩa là không bị khoá vào app.
//
// File thuần: không React, không Firestore, không DOM.
// ---------------------------------------------------------------------------
import type { Range } from '@/lib/range';
import type { Activity, Category } from '@/types/logi';

/** Thứ tự cột là hợp đồng - đổi thứ tự sẽ làm hỏng script của người khác. */
export const CSV_COLUMNS = [
  'id',
  'category',
  'label',
  'start',
  'end',
  'durationMin',
  'logicalDate',
  'logicalWeek',
  'status',
  'source',
] as const;

/**
 * Excel trên Windows đọc CSV theo bảng mã hệ thống, nên tiếng Việt sẽ thành ký
 * tự lạ. Ba byte BOM ở đầu file bảo nó "đây là UTF-8".
 */
export const BOM = '﻿';

/**
 * Bọc một field theo RFC 4180.
 *
 * `label` do giọng nói sinh ra ("worked on devops, then lunch") nên dấu phẩy là
 * chuyện thường, không phải ngoại lệ hiếm.
 */
export function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * epoch ms → "2026-08-26T09:30:00+07:00".
 *
 * Dùng giờ ĐỊA PHƯƠNG kèm offset chứ không phải UTC: mở file lên phải thấy
 * đúng giờ mình đã sống, không phải giờ lệch 7 tiếng.
 */
export function isoWithOffset(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

  // getTimezoneOffset() trả về số PHÚT phải cộng để ra UTC → dấu bị ngược.
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';

  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  );
}

export function toCsv(activities: Activity[]): string {
  const lines = [CSV_COLUMNS.join(',')];

  for (const a of activities) {
    lines.push(
      [
        csvField(a.id),
        csvField(a.category),
        csvField(a.label),
        csvField(isoWithOffset(a.startAt)),
        // Session đang chạy chưa có kết thúc - để trống chứ không bịa ra `now`.
        csvField(a.endAt === null ? '' : isoWithOffset(a.endAt)),
        csvField(a.durationMin),
        csvField(a.logicalDate),
        csvField(a.logicalWeek),
        csvField(a.status),
        csvField(a.source),
      ].join(',')
    );
  }

  // CRLF theo RFC 4180; Excel cũ trên Windows cần đúng cặp này.
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Ngày ngưng category 'sleep' (AMENDMENT-remove-sleep mục 4.4).
 * File export CŨ tải về trước ngày này là bản duy nhất còn giữ lịch sử sleep.
 */
export const SLEEP_RETIRED_ON = '2026-08-29';

export interface JsonExport {
  exportedAt: string;
  /**
   * Vì sao file mới không còn record 'sleep' nào.
   * Không bắt buộc: file export CŨ không có field này, mà Restore vẫn
   * phải đọc được chúng.
   */
  note?: string;
  range: { from: string; to: string };
  weekTargets: { week: string; weekly: Record<Category, number> }[];
  activities: Activity[];
  /**
   * Sổ nợ lúc export. Chỉ kèm ở bản "All time": file theo một khoảng ngày
   * không nói lên được sổ nợ của khoảng đó, ghi vào sẽ gây hiểu nhầm.
   */
  debt?: Partial<Record<Category, number>>;
}

/**
 * Kèm `weekTargets` chứ không chỉ activities: thiếu target thì người phân tích
 * ngoài app không có cách nào dựng lại "đã lệch bao nhiêu so với dự định".
 */
export function toJson(
  activities: Activity[],
  range: Range,
  weekTargets: Map<string, Record<Category, number>>,
  now: number = Date.now(),
  debt?: Partial<Record<Category, number>>
): string {
  const out: JsonExport = {
    exportedAt: isoWithOffset(now),
    note: `sleep category was retired on ${SLEEP_RETIRED_ON}`,
    range: { from: range.from, to: range.to },
    weekTargets: [...weekTargets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, weekly]) => ({ week, weekly })),
    activities,
    ...(debt ? { debt } : {}),
  };
  return JSON.stringify(out, null, 2);
}

/** "logi-2026-08-01_2026-08-31.csv" */
export function exportFilename(range: { from: string; to: string }, ext: 'csv' | 'json'): string {
  return range.from === range.to
    ? `logi-${range.from}.${ext}`
    : `logi-${range.from}_${range.to}.${ext}`;
}
