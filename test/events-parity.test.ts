import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logicalDate } from '@/lib/balance';
import * as app from '@/lib/events';
import * as fn from '../functions/src/events.ts';
import { at } from './_helpers.ts';

// ---------------------------------------------------------------------------
// Cloud Function không import được code của app, nên `functions/src/events.ts`
// là bản chép tay. Hai bản chép nào rồi cũng trôi khỏi nhau - trừ khi có test
// giữ chúng lại.
//
// Lệch ở đây nghĩa là thông báo trên màn khoá nói một đằng, danh sách trong
// app nói một nẻo. Hoặc tệ hơn: push sai ngày.
// ---------------------------------------------------------------------------

/** Mỗi giờ trong nhiều ngày, gồm cả mốc 04:00 và giao thừa. */
function everyHour(from: string, days: number): number[] {
  const out: number[] = [];
  const start = at(from, '00:00');
  for (let h = 0; h < days * 24; h++) out.push(start + h * 3_600_000);
  return out;
}

const NOWS = [
  ...everyHour('2026-10-08', 10),
  ...everyHour('2026-12-28', 8), // qua năm
  ...everyHour('2028-02-26', 5), // năm nhuận
];

const DATES = [
  '2026-10-15',
  '2026-10-09',
  '2026-11-01',
  '2027-01-01',
  '2028-02-29',
  '2028-03-01',
];

test('daysBetween khớp từng giờ một, kể cả qua mốc 04:00', () => {
  for (const now of NOWS) {
    const today = logicalDate(now);
    for (const d of DATES) {
      assert.equal(
        fn.daysBetween(today, d),
        app.daysUntil(d, now),
        `lệch tại ${d} / ${new Date(now).toISOString()}`
      );
    }
  }
});

test('countdownText khớp từng ký tự, từ -400 tới 400 ngày', () => {
  for (let n = -400; n <= 400; n++) {
    assert.equal(fn.countdownText(n), app.countdownText(n), `lệch tại ${n} ngày`);
  }
});

test('dateLabel khớp trên cả một năm', () => {
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 366; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    assert.equal(fn.dateLabel(d), app.dateLabel(d), `lệch tại ${d}`);
  }
});

test('MILESTONES giống nhau ở cả hai bản', () => {
  assert.deepEqual([...fn.MILESTONES], [14, 7, 3, 1, 0]);
  for (let n = -5; n <= 20; n++) {
    assert.equal(fn.isMilestone(n), app.isMilestone(n), `lệch tại ${n}`);
  }
});

test('whenLabel khớp, có giờ lẫn không giờ', () => {
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 366; i += 7) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    for (const time of [null, '00:00', '06:30', '11:30', '23:59']) {
      assert.equal(fn.whenLabel(d, time), app.whenLabel(d, time), `lệch tại ${d} ${time}`);
    }
  }
});
