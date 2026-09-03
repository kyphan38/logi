import { logicalDate, logicalWeek } from '@/lib/balance';
import type { Activity, ActivityStatus, Category } from '@/types/logi';

export const H = 3_600_000;
export const MIN = 60_000;

/** at('2026-08-26', '22:00') → epoch ms theo giờ máy. Đọc test cho dễ. */
export function at(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
}

export function act(o: {
  id?: string;
  category?: Category;
  startAt: number;
  endAt?: number | null;
  status?: ActivityStatus;
  label?: string | null;
  taskId?: string | null;
}): Activity {
  const startAt = o.startAt;
  const endAt = o.endAt ?? null;
  return {
    id: o.id ?? `a${startAt}`,
    category: o.category ?? 'work',
    label: o.label ?? null,
    startAt,
    endAt,
    durationMin: endAt === null ? null : Math.round((endAt - startAt) / MIN),
    logicalDate: logicalDate(startAt),
    logicalWeek: logicalWeek(startAt),
    status: o.status ?? (endAt === null ? 'active' : 'done'),
    source: 'manual',
    confidence: null,
    rawText: null,
    taskId: o.taskId ?? null,
    createdAt: startAt,
    updatedAt: startAt,
  };
}
