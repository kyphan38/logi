// ============================================================
// logi - Backup & khôi phục (Stage 6 Task 3)
//
// Sau một năm đây là dữ liệu không thể tạo lại, mà Firestore free tier
// KHÔNG có backup tự động. File này lo hai việc:
//   1. Nhắc export đúng lúc, không nhắc dai
//   2. Đọc file JSON đã export và dựng ra kế hoạch khôi phục CHỈ-THÊM
//
// Thuần: không React, không Firestore. Test bằng `node --test`.
// ============================================================

import { logicalDate, logicalWeekday } from '@/lib/balance';
import type { JsonExport } from '@/lib/export';
import { daysBetween } from '@/lib/range';
import { CATEGORIES, type Activity, type Category } from '@/types/logi';

// ------------------------------------------------------------
// Nhắc export
// ------------------------------------------------------------

/** Chưa export lần nào mà đã có ngần này ngày dữ liệu thì nhắc ngay. */
export const FIRST_NUDGE_DAYS = 30;

export interface ExportNudge {
  show: boolean;
  text: string;
  /** Số ngày kể từ lần export gần nhất; null = chưa bao giờ. */
  daysAgo: number | null;
}

const NO_NUDGE: ExportNudge = { show: false, text: '', daysAgo: null };

/**
 * Số ngày TRÔI QUA giữa hai ngày logic.
 * `daysBetween()` của range.ts đếm cả hai đầu (cùng ngày = 1), dùng cho
 * độ dài khoảng. Ở đây cần hiệu số, nên trừ đi một.
 */
function daysAgoOf(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to) - 1);
}

/** Chủ nhật đầu tiên của tháng. */
function isFirstSunday(now: number): boolean {
  if (logicalWeekday(now) !== 0) return false;
  const day = Number(logicalDate(now).slice(8, 10));
  return day <= 7;
}

/**
 * Nhắc mỗi Chủ nhật đầu tháng, cộng thêm một lần cho người chưa export bao giờ
 * mà đã tích được hơn một tháng dữ liệu.
 *
 * Cố tình KHÔNG nhắc mỗi ngày: nhắc dai thì người dùng học cách bỏ qua,
 * và lần thật sự cần nhắc cũng bị bỏ qua luôn.
 */
export function exportNudge(input: {
  lastExport: number | null;
  /** logicalDate của record cũ nhất, null nếu chưa có dữ liệu. */
  firstRecord: string | null;
  now: number;
}): ExportNudge {
  const { lastExport, firstRecord, now } = input;
  const today = logicalDate(now);

  // Chưa export bao giờ mà đã có hơn một tháng dữ liệu → nhắc ngay,
  // không đợi Chủ nhật đầu tháng. Đây là nhóm rủi ro nhất.
  if (lastExport === null) {
    if (!firstRecord) return NO_NUDGE;
    if (daysAgoOf(firstRecord, today) < FIRST_NUDGE_DAYS) return NO_NUDGE;
    return { show: true, text: 'Never exported. Back up your data.', daysAgo: null };
  }

  const days = daysAgoOf(logicalDate(lastExport), today);
  if (!isFirstSunday(now)) return NO_NUDGE;
  return {
    show: true,
    text: `Last export: ${days} ${days === 1 ? 'day' : 'days'} ago`,
    daysAgo: days,
  };
}

// ------------------------------------------------------------
// Đọc file backup
// ------------------------------------------------------------

export interface BackupFile extends JsonExport {
  /** Sổ nợ lúc export. Có thể thiếu ở file cũ. */
  debt?: Partial<Record<Category, number>>;
}

export interface ParseResult {
  file: BackupFile | null;
  error: string | null;
}

function isActivity(v: unknown): v is Activity {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    typeof a.category === 'string' &&
    typeof a.startAt === 'number' &&
    typeof a.logicalDate === 'string'
  );
}

/**
 * Kén chọn có chủ đích. File này sẽ được ghi thẳng vào database,
 * nên thà từ chối một file lạ còn hơn nhận vào rác không sửa được.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { file: null, error: 'Not a valid JSON file.' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { file: null, error: 'Not a logi backup file.' };
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.activities)) {
    return { file: null, error: 'No activities in this file. Is it the CSV export?' };
  }

  const activities = o.activities.filter(isActivity);
  if (activities.length === 0) {
    return { file: null, error: 'No readable records in this file.' };
  }

  const weekTargets = Array.isArray(o.weekTargets)
    ? (o.weekTargets as BackupFile['weekTargets'])
    : [];

  return {
    file: {
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      range: (o.range as BackupFile['range']) ?? { from: '', to: '' },
      weekTargets,
      activities,
      debt: (o.debt as BackupFile['debt']) ?? undefined,
    },
    error: null,
  };
}

// ------------------------------------------------------------
// Kế hoạch khôi phục
// ------------------------------------------------------------

export interface RestorePreview {
  records: number;
  weeks: number;
  from: string;
  to: string;
  targets: number;
}

export function previewBackup(file: BackupFile): RestorePreview {
  const dates = file.activities.map((a) => a.logicalDate).sort();
  const weeks = new Set(file.activities.map((a) => a.logicalWeek));
  return {
    records: file.activities.length,
    weeks: weeks.size,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    targets: file.weekTargets.length,
  };
}

export interface RestorePlan {
  /** Record sẽ được thêm. */
  add: Activity[];
  /** Đã có sẵn - bỏ qua, KHÔNG ghi đè. */
  skip: number;
  /**
   * Record thuộc category đã ngưng dùng - bỏ qua.
   * File export cũ vẫn còn 'sleep'. Không lọc thì Restore sẽ dựng lại đúng
   * thứ vừa xoá, mà Firestore rules cũng chặn, người dùng chỉ thấy lỗi câm.
   */
  retired: number;
}

/**
 * Chỉ thêm, không bao giờ ghi đè hay xoá.
 *
 * Import là thao tác của người đang hoảng vì mất dữ liệu. Ghi đè ở đây
 * nghĩa là một lần bấm nhầm sẽ đổi dữ liệu đang đúng thành dữ liệu cũ hơn.
 */
export function planRestore(file: BackupFile, existingIds: ReadonlySet<string>): RestorePlan {
  const add: Activity[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let retired = 0;

  for (const a of file.activities) {
    if (!(CATEGORIES as readonly string[]).includes(a.category)) {
      retired++;
      continue;
    }
    if (existingIds.has(a.id) || seen.has(a.id)) {
      skip++;
      continue;
    }
    seen.add(a.id);
    add.push(a);
  }
  return { add, skip, retired };
}

/** Gõ đúng chữ này mới cho chạy. */
export const RESTORE_WORD = 'RESTORE';
