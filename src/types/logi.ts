// ============================================================
// logi - Data model & targets
// ============================================================

export const CATEGORIES = ['learn', 'work', 'fitness', 'sleep', 'leisure'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  learn: 'Learn',
  work: 'Work',
  fitness: 'Fitness',
  sleep: 'Sleep',
  leisure: 'Leisure',
};

// Dùng cho chart. Sleep tông nguội, Work tông ấm-cảnh-báo.
export const CATEGORY_COLOR: Record<Category, string> = {
  learn: '#6366f1',
  work: '#f59e0b',
  fitness: '#10b981',
  sleep: '#64748b',
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

  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// Quy tắc thời gian
// ------------------------------------------------------------

/** Ngày logic bắt đầu 04:00 → giấc ngủ 22:00 thuộc về ngày hôm trước. */
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
  //      CN   T2   T3   T4   T5   T6   T7
  sleep: [7.0, 6.5, 6.5, 6.5, 6.5, 6.5, 7.0], // 46.5
  work: [0.0, 8.0, 9.5, 8.0, 9.5, 8.0, 0.0],  // 43  (T3/T5 +1.5h commute)
  learn: [8.0, 3.0, 3.0, 3.0, 3.0, 3.0, 8.0], // 31
  fitness: [0.0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], // 9  (6 ngày, nghỉ CN)
  leisure: [1.75, 0.5, 0.5, 0.5, 0.5, 0.5, 1.75], // 6
};

export function weeklyTotal(daily: number[]): number {
  return daily.reduce((a, b) => a + b, 0);
}

export const BASELINE_WEEKLY: Record<Category, number> = {
  sleep: weeklyTotal(BASELINE_DAILY.sleep),     // 46.5
  work: weeklyTotal(BASELINE_DAILY.work),       // 43
  learn: weeklyTotal(BASELINE_DAILY.learn),     // 31
  fitness: weeklyTotal(BASELINE_DAILY.fitness), // 9
  leisure: weeklyTotal(BASELINE_DAILY.leisure), // 6
};

/** 135.5h - tổng ngân sách. Zero-sum: mọi preset phải khớp con số này. */
export const TOTAL_BUDGET = Object.values(BASELINE_WEEKLY).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------
// Sàn không thương lượng - chặn việc tự hạ chuẩn khi crunch
// ------------------------------------------------------------

export const HARD_FLOOR: Partial<Record<Category, number>> = {
  sleep: 42,   // 6h/đêm
  fitness: 4.5, // 3 buổi/tuần
};

// ------------------------------------------------------------
// Preset - Sleep cố định 46.5h ở mọi mode.
// 4 category còn lại chia nhau đúng 89h.
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
    weekly: { sleep: 46.5, work: 43, learn: 31, fitness: 9, leisure: 6 },
  },
  crunch: {
    id: 'crunch',
    label: 'Crunch',
    hint: 'Deadline / OT - ghi nợ Learn',
    weekly: { sleep: 46.5, work: 57, learn: 19, fitness: 6, leisure: 7 },
  },
  deep_learn: {
    id: 'deep_learn',
    label: 'Deep Learn',
    hint: 'Ôn thi / cày chứng chỉ',
    weekly: { sleep: 46.5, work: 40, learn: 40, fitness: 6, leisure: 3 },
  },
  recovery: {
    id: 'recovery',
    label: 'Recovery',
    hint: 'Sau crunch - trả nợ sức khoẻ',
    weekly: { sleep: 46.5, work: 40, learn: 22, fitness: 12, leisure: 15 },
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
