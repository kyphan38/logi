import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expectedForRange } from '@/lib/range-target';
import type { Range } from '@/lib/range';
import { bedtimeScore, computeSignals, type Signals } from '@/lib/signals';
import { PRESETS, type Activity, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

// ---------------------------------------------------------------------------
// AMENDMENT sleep-boundary §5: giờ đi ngủ phải quy về thang liên tục trước khi
// lấy trung vị, nếu không 22:00 và 00:15 sẽ ra con số vô nghĩa.
// ---------------------------------------------------------------------------

const MON = '2026-08-24';
const TUE = '2026-08-25';
const WED = '2026-08-26';
const THU = '2026-08-27';
const NOW = at('2026-08-31', '12:00');

const WEEK: Range = { from: MON, to: '2026-08-30', kind: 'custom', isPartial: false };

const targets = new Map<string, Record<Category, number>>([
  ['2026-W34', PRESETS.normal.weekly],
  ['2026-W35', PRESETS.normal.weekly],
]);

function sig(activities: Activity[]): Signals {
  return computeSignals(
    activities,
    WEEK,
    expectedForRange(WEEK, targets, NOW),
    targets,
    undefined,
    NOW
  );
}

/** Một đêm: đi ngủ ngày `date` lúc `from`, dậy ngày `wakeDate` lúc `to`. */
function night(date: string, from: string, wakeDate: string, to: string): Activity {
  return act({
    id: `sleep-${date}-${from}`,
    category: 'sleep',
    startAt: at(date, from),
    endAt: at(wakeDate, to),
  });
}

const hhmm = (min: number) => `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;

test('bedtimeScore: 22:00 → 22.0, 00:15 → 24.25, 01:30 → 25.5', () => {
  assert.equal(bedtimeScore(at(MON, '22:00')), 22);
  assert.equal(bedtimeScore(at(TUE, '00:15')), 24.25);
  assert.equal(bedtimeScore(at(TUE, '01:30')), 25.5);
});

test('trung vị của [22:00, 23:30, 00:15] ra 23:30, không ra giữa trưa', () => {
  const g = sig([
    night(MON, '22:00', TUE, '05:00'),
    night(TUE, '23:30', WED, '06:00'),
    night(THU, '00:15', THU, '07:30'), // thuộc ngày logic WED
  ]);

  assert.equal(g.sleep.nights, 3);
  assert.equal(hhmm(g.sleep.medianBedtime!), '23:30');
});

test('bedtimeSpreadMin của [22:00, 00:15] = 135 phút', () => {
  const g = sig([
    night(MON, '22:00', TUE, '05:00'),
    night(WED, '00:15', WED, '07:30'),
  ]);

  assert.equal(g.sleep.nights, 2);
  assert.equal(g.sleep.bedtimeSpreadMin, 135, 'hai đêm chênh 2h15m, không phải 22h');
  assert.equal(g.sleep.lateNights, 1, 'chỉ đêm 00:15 là sau nửa đêm');
});

test('nap 90 phút không tính vào thống kê đêm', () => {
  const nap = act({
    id: 'nap',
    category: 'sleep',
    startAt: at(TUE, '13:00'),
    endAt: at(TUE, '14:30'),
  });
  const g = sig([night(MON, '22:00', TUE, '05:00'), nap]);

  assert.equal(g.sleep.nights, 1, 'nap không phải một đêm');
  assert.equal(g.sleep.napCount, 1);
  assert.ok(Math.abs(g.sleep.napHours - 1.5) < 0.001);
  assert.equal(g.sleep.bedtimeSpreadMin, null, 'chỉ một đêm thì không có dao động');
  assert.equal(g.sleep.lostMorningBlocks, 0, 'nap chiều không làm mất buổi sáng');
});

test('lostMorningBlocks đếm đúng số đêm dậy sau 07:00', () => {
  const g = sig([
    night(MON, '22:00', TUE, '04:30'), // dậy sớm
    night(WED, '00:15', WED, '07:30'), // dậy muộn
    night(THU, '00:40', '2026-08-28', '08:00'), // dậy muộn
  ]);

  assert.equal(g.sleep.nights, 3);
  assert.equal(g.sleep.lostMorningBlocks, 2);
  assert.equal(g.sleep.lateNights, 2);
  assert.equal(g.sleep.wakeSpreadMin, 210, '04:30 → 08:00 là 3h30m');
});
