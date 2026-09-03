// ============================================================
// logi - Data model & targets
// ============================================================

export const CATEGORIES = ['learn', 'work', 'fitness', 'leisure'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  learn: 'Learn',
  work: 'Work',
  fitness: 'Fitness',
  leisure: 'Leisure',
};

// Dùng cho chart. Work tông ấm-cảnh-báo.
export const CATEGORY_COLOR: Record<Category, string> = {
  learn: '#6366f1',
  work: '#f59e0b',
  fitness: '#10b981',
  leisure: '#ec4899',
};

export type ActivityStatus = 'scheduled' | 'active' | 'done' | 'abandoned';
export type ActivitySource = 'voice' | 'manual' | 'quick';

/** Firestore: users/{uid}/activities/{id} */
export interface Activity {
  id: string;
  category: Category;
  /** Nguyên văn cụm từ người dùng nói, để hiển thị lại. VD "worked on devops" */
  label: string | null;

  startAt: number;          // epoch ms
  endAt: number | null;     // null khi đang chạy
  durationMin: number | null; // denormalize khi stop → khỏi tính lại lúc query

  /** "2026-08-26" - ngày logic, mốc cắt 04:00. Field query chính. */
  logicalDate: string;
  /** "2026-W35" - tuần ISO của logicalDate. Field query chính cho analytics. */
  logicalWeek: string;

  status: ActivityStatus;
  source: ActivitySource;
  /** Gemini trả về 0–1. < 0.85 → bắt buộc confirm. */
  confidence: number | null;
  /** Transcript thô, để debug khi parse sai. Không lưu audio. */
  rawText: string | null;

  /**
   * Task trong checklist đã sinh ra session này (Stage 8, quyết định 5).
   * `null` = bấm từ lưới 4 nút, từ voice, hay nhập tay - KHÔNG tính vào task.
   * Gắn tay được ở `RecordSheet`, nhưng app không bao giờ tự đoán.
   */
  taskId: string | null;

  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// Quy tắc thời gian
// ------------------------------------------------------------

/**
 * Ngày logic bắt đầu 04:00. Không còn ghi giấc ngủ, nhưng mốc này vẫn giữ:
 * buổi học tới 01:00 đêm vẫn thuộc về ngày hôm trước, đúng như người ta nghĩ.
 */
export const DAY_CUTOFF_HOUR = 4;

/** Quá 15h mà chưa stop → đánh dấu abandoned, hỏi lại khi mở app. */
export const MAX_SESSION_MIN = 15 * 60;

export const TIMEZONE = 'Asia/Ho_Chi_Minh';

// ------------------------------------------------------------
// Target theo từng ngày trong tuần (giờ)
// Index 0 = Chủ nhật ... 6 = Thứ 7  (khớp Date.getDay())
// ------------------------------------------------------------

export type DailyTargets = Record<Category, number[]>;

export const BASELINE_DAILY: DailyTargets = {
  //        CN    T2   T3   T4   T5   T6   T7
  work: [0.0, 8.0, 9.5, 8.0, 9.5, 8.0, 0.0], // 43  (T3/T5 +1.5h commute)
  learn: [8.0, 3.0, 3.0, 3.0, 3.0, 3.0, 8.0], // 31
  fitness: [0.0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], // 9  (6 ngày, nghỉ CN)
  leisure: [1.75, 0.5, 0.5, 0.5, 0.5, 0.5, 1.75], // 6
};

export function weeklyTotal(daily: number[]): number {
  return daily.reduce((a, b) => a + b, 0);
}

export const BASELINE_WEEKLY: Record<Category, number> = {
  work: weeklyTotal(BASELINE_DAILY.work),       // 43
  learn: weeklyTotal(BASELINE_DAILY.learn),     // 31
  fitness: weeklyTotal(BASELINE_DAILY.fitness), // 9
  leisure: weeklyTotal(BASELINE_DAILY.leisure), // 6
};

/** 89h - tổng ngân sách. Zero-sum: mọi preset phải khớp con số này. */
export const TOTAL_BUDGET = Object.values(BASELINE_WEEKLY).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------
// Sàn không thương lượng - chặn việc tự hạ chuẩn khi crunch
// ------------------------------------------------------------

export const HARD_FLOOR: Partial<Record<Category, number>> = {
  fitness: 4.5, // 3 buổi/tuần
};

// ------------------------------------------------------------
// Preset - 4 category chia nhau đúng 89h ở mọi mode.
// ------------------------------------------------------------

export type PresetId = 'normal' | 'crunch' | 'deep_learn' | 'recovery';

export interface Preset {
  id: PresetId;
  label: string;
  hint: string;
  weekly: Record<Category, number>;
}

export const PRESETS: Record<PresetId, Preset> = {
  normal: {
    id: 'normal',
    label: 'Normal',
    hint: 'Tuần tiêu chuẩn',
    weekly: { work: 43, learn: 31, fitness: 9, leisure: 6 },
  },
  crunch: {
    id: 'crunch',
    label: 'Crunch',
    hint: 'Deadline / OT - ghi nợ Learn',
    weekly: { work: 57, learn: 19, fitness: 6, leisure: 7 },
  },
  deep_learn: {
    id: 'deep_learn',
    label: 'Deep Learn',
    hint: 'Ôn thi / cày chứng chỉ',
    weekly: { work: 40, learn: 40, fitness: 6, leisure: 3 },
  },
  recovery: {
    id: 'recovery',
    label: 'Recovery',
    hint: 'Sau crunch - trả nợ sức khoẻ',
    weekly: { work: 40, learn: 22, fitness: 12, leisure: 15 },
  },
};

/** Firestore: users/{uid}/weekTargets/{logicalWeek} */
export interface WeekTarget {
  week: string;           // "2026-W35"
  preset: PresetId;
  weekly: Record<Category, number>;
  /** Nợ được cộng thêm vào target tuần này (giờ). */
  debtApplied: Partial<Record<Category, number>>;
  changedAt: number;
  /** true nếu sửa target sau thứ Năm → chart gắn dấu ⚠ */
  lateChange: boolean;
  lockedAt: number | null; // 21:00 CN → đóng sổ
}

/** Firestore: users/{uid}/meta/debt */
export interface DebtLedger {
  balance: Partial<Record<Category, number>>; // giờ đang nợ
  updatedAt: number;
}

export const DEBT_CARRYOVER_RATE = 0.5; // trả 50% nợ ở tuần kế
export const DEBT_CARRYOVER_CAP = 10;   // trần giờ cộng thêm mỗi tuần
export const DEBT_LOCK_THRESHOLD = 20;  // nợ > 20h → khoá preset Crunch

// ------------------------------------------------------------
// Stage 8 - Task checklist tuần
// ------------------------------------------------------------

/** Pool tối đa 5 task (quyết định 1). Nhiều hơn thì lưới không còn đọc được. */
export const MAX_POOL_TASKS = 5;

/** Tối đa 3 task mỗi ngày, CHẶN CỨNG (quyết định 3). */
export const MAX_TASKS_PER_DAY = 3;

/** Tối thiểu 1 task/ngày chỉ là GỢI Ý - ngày trống vẫn hợp lệ. */
export const MIN_TASKS_PER_DAY = 1;

export const TASK_TITLE_MAX = 32;
export const TASK_MIN_DURATION = 5;
export const TASK_MAX_DURATION = 8 * 60;

/** Firestore: users/{uid}/taskPool/{taskId} */
export interface PoolTask {
  id: string;
  title: string;
  /** Thời lượng dự kiến mỗi lần làm, tính bằng phút. */
  durationMin: number;
  category: Category;
  /** Thứ tự hàng trong lưới. */
  order: number;
  /**
   * Xoá = set mốc này, KHÔNG hard-delete (quyết định 14). Tuần cũ vẫn phải
   * hiện được task, kể cả sau khi nó rời pool.
   */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Một ô đã bật trong lưới, kèm BẢN CHỤP thời điểm gán.
 *
 * `title` / `durationMin` / `category` cố ý lặp lại dữ liệu của pool. Đọc từ
 * pool lúc hiển thị thì đổi Running 45' → 30' sẽ khiến một tuần từng "chưa
 * xong" tự nhiên thành "đã xong" - lịch sử bị viết lại (quyết định 14).
 */
export interface PlannedCell {
  taskId: string;
  /** 0 = CN … 6 = T7, khớp `logicalWeekday()`. */
  dow: number;
  title: string;
  durationMin: number;
  category: Category;
}

/** Firestore: users/{uid}/weekPlans/{week} - MỘT doc cho cả tuần (≤ 35 ô). */
export interface WeekPlan {
  week: string;
  cells: PlannedCell[];
  updatedAt: number;
}

// ------------------------------------------------------------
// Stage 8 - Bedtime
// ------------------------------------------------------------

/**
 * Firestore: users/{uid}/dayLogs/{logicalDate}
 *
 * Bedtime là MỘT MỐC, không phải một khoảng, nên nó không sống trong
 * `activities`: không có target, không vào ngân sách 89h, không xuất hiện ở
 * Balance / By day / When.
 */
export interface DayLog {
  /** "2026-08-26" - ngày logic, cũng là doc id. */
  date: string;
  /** Epoch ms lúc đi ngủ. `null` = chưa ghi hôm đó. */
  bedtimeAt: number | null;
  updatedAt: number;
}
