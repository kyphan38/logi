import type { SheetTarget } from '@/components/RecordSheet';
import { roundDown } from '@/lib/datetime';

/**
 * Default time for a manually added record: today → the last hour (rounded to
 * 15 minutes); a past day → 12:00–13:00 of the day being viewed.
 */
export function newRecordDefaults(selected: string, today: string, now: number): SheetTarget {
  if (selected === today) {
    const end = roundDown(now, 15);
    return { mode: 'create', startAt: end - 3_600_000, endAt: end };
  }
  const [y, m, d] = selected.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  return { mode: 'create', startAt: start, endAt: start + 3_600_000 };
}
