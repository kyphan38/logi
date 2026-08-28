import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logicalDate, logicalWeek, logicalWeekday } from '@/lib/balance';
import * as fn from '../functions/src/time.ts';
import { at } from './_helpers.ts';

// ---------------------------------------------------------------------------
// Cloud Function chạy tách khỏi app nên phải chép lại quy ước ngày logic.
// Hai bản chép nào rồi cũng trôi khỏi nhau — trừ khi có test giữ chúng lại.
//
// Lệch một ngày ở đây nghĩa là push nhắc sai ngày, hoặc "tuần này" trong thông
// báo không phải tuần đang hiện trong app.
// ---------------------------------------------------------------------------

/** Quét từng giờ trong nhiều ngày, gồm cả mốc 04:00 và giao thừa. */
function everyHour(from: string, days: number): number[] {
  const out: number[] = [];
  const start = at(from, '00:00');
  for (let h = 0; h < days * 24; h++) out.push(start + h * 3_600_000);
  return out;
}

const SPANS = [
  ...everyHour('2026-08-24', 14), // tuần thường
  ...everyHour('2026-12-28', 10), // qua năm: 2026-W53 → 2027-W01
  ...everyHour('2027-01-01', 7),
];

test('logicalDate của function khớp app từng giờ một', () => {
  for (const ts of SPANS) {
    assert.equal(fn.logicalDate(ts), logicalDate(ts), `lệch tại ${new Date(ts).toISOString()}`);
  }
});

test('logicalWeek khớp app, kể cả tuần vắt qua năm', () => {
  for (const ts of SPANS) {
    assert.equal(fn.logicalWeek(ts), logicalWeek(ts), `lệch tại ${new Date(ts).toISOString()}`);
  }
});

test('logicalWeekday khớp app — Chủ nhật phải là 0 ở cả hai nơi', () => {
  for (const ts of SPANS) {
    assert.equal(fn.logicalWeekday(ts), logicalWeekday(ts));
  }
});

test('markAt trả đúng mốc giờ địa phương', () => {
  assert.equal(fn.markAt('2026-08-26', 6, 15), at('2026-08-26', '06:15'));
  assert.equal(fn.markAt('2026-08-26', 20, 45), at('2026-08-26', '20:45'));
});

test('dayStart là 04:00, không phải nửa đêm', () => {
  assert.equal(fn.dayStart('2026-08-26'), at('2026-08-26', '04:00'));
});

test('03:59 vẫn thuộc ngày hôm trước ở cả hai bản', () => {
  const ts = at('2026-08-26', '03:59');
  assert.equal(fn.logicalDate(ts), '2026-08-25');
  assert.equal(fn.logicalDate(ts), logicalDate(ts));
});
