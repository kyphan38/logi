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

// ------------------------------------------------------------
// Stage 9 - Sự kiện sắp tới (tab "Reminder")
// ------------------------------------------------------------

/**
 * Các mốc nhắc trước, tính bằng ngày. GIẢM DẦN.
 *
 * Năm mốc là đủ dày để không quên, đủ thưa để không thành tiếng ồn. Thêm mốc
 * nữa thì người dùng bắt đầu bỏ qua mọi thông báo của app.
 */
export const MILESTONES = [14, 7, 3, 1, 0] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Giờ gửi push nhắc sự kiện, giờ địa phương. Một lần mỗi ngày. */
export const EVENT_PUSH_HOUR = 6;

/**
 * Trần sự kiện đang chờ. Có trần thì subscribe cả collection là an toàn:
 * không phân trang, không cửa sổ ngày, không query phức tạp.
 */
export const MAX_EVENTS = 40;

export const EVENT_TITLE_MAX = 60;
export const EVENT_NOTE_MAX = 140;

/** Firestore: users/{uid}/events/{eventId} */
export interface EventItem {
  id: string;
  title: string;
  /** "2026-10-15" - ngày logic, mốc cắt 04:00 giống mọi ngày khác trong app. */
  date: string;
  /**
   * "11:30" (24 giờ), hoặc `null` = cả ngày.
   *
   * CHỈ để hiển thị. Mốc nhắc vẫn tính bằng ngày, và push vẫn gửi lúc 06:00 -
   * giờ ở đây không đổi lịch gửi. Nhắc trước vài tiếng là việc khác, chưa làm.
   */
  time: string | null;
  note: string | null;
  /**
   * Mốc nào đã push rồi: `{ "14": 1760... }`.
   *
   * Nằm ngay trên doc sự kiện chứ không ở `meta/pushLog`: cờ "đã gửi" ở cạnh
   * dữ liệu nó nói về thì không bao giờ lệch, kể cả khi sự kiện bị đổi ngày.
   */
  notified: Record<string, number>;
  /** Xoá mềm: doc ở lại, chỉ set mốc này. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// Stage 10 - Routine (checklist hằng ngày, KHÔNG gắn với thời gian)
// ------------------------------------------------------------

export const ROUTINE_TITLE_MAX = 40;
export const ROUTINE_ITEM_MAX = 80;

/**
 * Một mục trong nhóm. `days` là các thứ mục này hiện ra (0 = CN … 6 = T7,
 * khớp `logicalWeekday()`). Một mục lặp nhiều ngày thì gõ tên MỘT lần.
 */
export interface RoutineItem {
  id: string;
  text: string;
  days: number[];
}

/**
 * Firestore: users/{uid}/routines/{groupId}
 *
 * Template lặp lại mỗi tuần, không gắn với tuần cụ thể. Sửa lúc nào thì áp
 * dụng từ lúc đó. Mục nằm ngay trong doc nhóm: một nhóm vài chục mục là vài KB.
 */
export interface RoutineGroup {
  id: string;
  title: string;
  order: number;
  items: RoutineItem[];
  /** Xoá mềm, giống `events`. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Firestore: users/{uid}/routineChecks/{logicalDate}
 *
 * Mỗi ngày logic một doc. "Reset" lúc 04:00 là tự nhiên: ngày mới đọc một doc
 * mới, đang trống. Không có gì phải xoá.
 */
export interface RoutineChecks {
  date: string;
  /** itemId → lúc tick. Bỏ tick = xoá key. */
  checked: Record<string, number>;
}
