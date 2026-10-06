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

// For charts. Work gets a warm warning tone.
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
  /** The exact phrase the user said, for display. E.g. "worked on devops" */
  label: string | null;

  startAt: number;          // epoch ms
  endAt: number | null;     // null while running
  durationMin: number | null; // denormalized on stop → no recompute at query time

  /** "2026-08-26" - the logical day, 04:00 cut. The main query field. */
  logicalDate: string;
  /** "2026-W35" - the ISO week of logicalDate. The main query field for analytics. */
  logicalWeek: string;

  status: ActivityStatus;
  source: ActivitySource;
  /** Gemini returns 0–1. < 0.85 → confirm required. */
  confidence: number | null;
  /** The raw transcript, for debugging bad parses. Audio is never stored. */
  rawText: string | null;

  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// Time rules
// ------------------------------------------------------------

/**
 * The logical day starts at 04:00. Sleep is no longer logged, but the cut
 * stays: a study session until 01:00 still belongs to the day before, as people expect.
 */
export const DAY_CUTOFF_HOUR = 4;

/** Over 15h without a stop → marked abandoned, asked again on app open. */
export const MAX_SESSION_MIN = 15 * 60;

export const TIMEZONE = 'Asia/Ho_Chi_Minh';

// ------------------------------------------------------------
// Target per weekday (hours)
// Index 0 = Sunday ... 6 = Saturday  (matches Date.getDay())
// ------------------------------------------------------------

export type DailyTargets = Record<Category, number[]>;

export const BASELINE_DAILY: DailyTargets = {
  //        CN    T2   T3   T4   T5   T6   T7
  work: [0.0, 8.0, 9.5, 8.0, 9.5, 8.0, 0.0], // 43  (T3/T5 +1.5h commute)
  learn: [8.0, 3.0, 3.0, 3.0, 3.0, 3.0, 8.0], // 31
  fitness: [0.0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], // 9  (6 days, Sunday off)
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

/** 89h - the total budget. Zero-sum: every preset must match this number. */
export const TOTAL_BUDGET = Object.values(BASELINE_WEEKLY).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------
// Non-negotiable floors - no lowering the bar during crunch
// ------------------------------------------------------------

export const HARD_FLOOR: Partial<Record<Category, number>> = {
  fitness: 4.5, // 3 sessions/week
};

// ------------------------------------------------------------
// Presets - 4 categories share exactly 89h in every mode.
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
    hint: 'Standard week',
    weekly: { work: 43, learn: 31, fitness: 9, leisure: 6 },
  },
  crunch: {
    id: 'crunch',
    label: 'Crunch',
    hint: 'Deadline or OT - adds Learn debt',
    weekly: { work: 57, learn: 19, fitness: 6, leisure: 7 },
  },
  deep_learn: {
    id: 'deep_learn',
    label: 'Deep Learn',
    hint: 'Certification or exam push',
    weekly: { work: 40, learn: 40, fitness: 6, leisure: 3 },
  },
  recovery: {
    id: 'recovery',
    label: 'Recovery',
    hint: 'Post-crunch reset',
    weekly: { work: 40, learn: 22, fitness: 12, leisure: 15 },
  },
};

/** Firestore: users/{uid}/weekTargets/{logicalWeek} */
export interface WeekTarget {
  week: string;           // "2026-W35"
  preset: PresetId;
  weekly: Record<Category, number>;
  /** Debt added onto this week's target (hours). */
  debtApplied: Partial<Record<Category, number>>;
  changedAt: number;
  /** true if the target was edited after Thursday → the chart gets a ⚠ mark */
  lateChange: boolean;
  lockedAt: number | null; // 21:00 Sun → closed
}

/** Firestore: users/{uid}/meta/debt */
export interface DebtLedger {
  balance: Partial<Record<Category, number>>; // hours owed
  updatedAt: number;
}

export const DEBT_CARRYOVER_RATE = 0.5; // pay 50% of debt next week
export const DEBT_CARRYOVER_CAP = 10;   // cap on added hours per week
export const DEBT_LOCK_THRESHOLD = 20;  // debt > 20h → Crunch preset locked

// ------------------------------------------------------------
// Stage 8 - Bedtime
// ------------------------------------------------------------

/**
 * Firestore: users/{uid}/dayLogs/{logicalDate}
 *
 * Bedtime is ONE MARK, not a span, so it does not live in `activities`: no
 * target, not in the 89h budget, not shown in Balance / By day / When.
 */
export interface DayLog {
  /** "2026-08-26" - the logical day, also the doc id. */
  date: string;
  /** Epoch ms of going to bed. `null` = not logged that day. */
  bedtimeAt: number | null;
  updatedAt: number;
}

// ------------------------------------------------------------
// Stage 9 - Upcoming events (the "Reminder" tab)
// ------------------------------------------------------------

/**
 * Advance reminder marks, in days. DESCENDING.
 *
 * Five marks are dense enough not to forget, sparse enough not to be noise.
 * More, and the user starts ignoring every notification from the app.
 */
export const MILESTONES = [14, 7, 3, 1, 0] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Time to send event reminder pushes, local time. Once a day. */
export const EVENT_PUSH_HOUR = 6;

/**
 * Cap on pending events. With a cap, subscribing to the whole collection is
 * safe: no paging, no date window, no complex query.
 */
export const MAX_EVENTS = 40;

export const EVENT_TITLE_MAX = 60;
export const EVENT_NOTE_MAX = 140;

/** Firestore: users/{uid}/events/{eventId} */
export interface EventItem {
  id: string;
  title: string;
  /** "2026-10-15" - the logical day, 04:00 cut like every other day in the app. */
  date: string;
  /**
   * "11:30" (24-hour), or `null` = all day.
   *
   * DISPLAY ONLY. Reminder marks still count in days, and push still sends at
   * 06:00 - the time here does not change the schedule. Reminding a few hours
   * ahead is a separate feature, not built.
   */
  time: string | null;
  note: string | null;
  /**
   * Which marks were already pushed: `{ "14": 1760... }`.
   *
   * Kept on the event doc itself, not in `meta/pushLog`: a "sent" flag next to
   * the data it describes never drifts, even when the event's date changes.
   */
  notified: Record<string, number>;
  /** Soft delete: the doc stays, only this mark is set. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// Stage 10 - Routine (a daily checklist, NOT tied to time)
// ------------------------------------------------------------

export const ROUTINE_TITLE_MAX = 40;
export const ROUTINE_ITEM_MAX = 80;

/**
 * One item in a group. `days` are the weekdays it shows (0 = Sun … 6 = Sat,
 * matching `logicalWeekday()`). An item repeating on many days is typed ONCE.
 */
export interface RoutineItem {
  id: string;
  text: string;
  days: number[];
}

/**
 * Firestore: users/{uid}/routines/{groupId}
 *
 * A template repeating every week, not tied to a specific week. Edits apply
 * from that moment. Items live in the group doc: a few dozen items is a few KB.
 */
export interface RoutineGroup {
  id: string;
  title: string;
  order: number;
  items: RoutineItem[];
  /** Soft delete, like `events`. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Firestore: users/{uid}/routineChecks/{logicalDate}
 *
 * One doc per logical day. The 04:00 "reset" is natural: a new day reads a new,
 * empty doc. Nothing to delete.
 */
export interface RoutineChecks {
  date: string;
  /** itemId → tick time. Untick = delete the key. */
  checked: Record<string, number>;
}
