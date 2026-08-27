import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickReminder, type Reminder } from '@/lib/reminders';
import { PRESETS, type Activity } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

const WEEKLY = PRESETS.normal.weekly;
const NONE = () => false;

// 2026-09-02 là thứ Tư. 2026-09-06 là Chủ nhật.
const WED = '2026-09-02';
const SUN = '2026-09-06';

function learn(date: string, time: string, hours: number): Activity {
  const startAt = at(date, time);
  return act({ category: 'learn', startAt, endAt: startAt + hours * H, id: `${date}-${time}` });
}

function pick(now: number, over: Partial<Parameters<typeof pickReminder>[0]> = {}) {
  return pickReminder({ now, day: [], week: [], weekly: WEEKLY, isDismissed: NONE, ...over });
}

// --- Mốc giờ ----------------------------------------------------------

test('trước 06:15 thì im lặng', () => {
  assert.equal(pick(at(WED, '05:30')), null);
});

test('06:15 chưa có Learn → nhắc sáng, có nút', () => {
  const r = pick(at(WED, '06:20'));
  assert.equal(r?.type, 'morning');
  assert.equal(r?.text, 'Morning study not logged yet.');
  assert.equal(r?.action, 'start-learn');
});

test('06:15 đã có Learn hôm nay → im lặng', () => {
  const day = [learn(WED, '05:00', 1)];
  assert.equal(pick(at(WED, '06:20'), { day }), null);
});

test('20:45 chưa học tối → nhắc tối, kèm số của tuần', () => {
  // Học buổi sáng vẫn tính là chưa học buổi tối.
  const day = [learn(WED, '06:00', 2)];
  const r = pick(at(WED, '20:50'), { day, week: [...day, learn('2026-08-31', '20:00', 12)] });
  assert.equal(r?.type, 'evening');
  assert.match(r!.text, /^Evening study not logged yet\. Learn: \d+(\.\d)?h \/ 31h this week\.$/);
  assert.equal(r?.action, 'start-learn');
});

test('20:45 đã học sau 19:00 → im lặng', () => {
  const day = [learn(WED, '19:30', 1)];
  assert.equal(pick(at(WED, '20:50'), { day }), null);
});

test('Learn kết thúc trước 19:00 vẫn bị coi là chưa học tối', () => {
  const day = [learn(WED, '17:00', 1.5)];
  assert.equal(pick(at(WED, '20:50'), { day })?.type, 'evening');
});

test('session Learn đang chạy vắt qua 19:00 → tính là đã học', () => {
  const running = act({ category: 'learn', startAt: at(WED, '18:30'), endAt: null, id: 'run' });
  assert.equal(pick(at(WED, '20:50'), { day: [running] }), null);
});

// --- Tổng kết tuần ----------------------------------------------------

test('CN 19:00 luôn hiện, kể cả khi đã học đủ', () => {
  const week = [learn(SUN, '19:10', 3)];
  const r = pick(at(SUN, '19:05'), { week });
  assert.equal(r?.type, 'weekly');
  assert.equal(r?.action, null, 'tổng kết chỉ để đọc, không có nút');
  assert.match(r!.text, /^Week wrap-up: /);
});

test('CN trước 19:00 thì chưa hiện tổng kết', () => {
  assert.notEqual(pick(at(SUN, '18:30'), { day: [learn(SUN, '06:00', 2)] })?.type, 'weekly');
});

test('thứ Tư 19:00 không có tổng kết tuần', () => {
  assert.notEqual(pick(at(WED, '19:30'))?.type, 'weekly');
});

test('tổng kết có dòng lệch lớn nhất', () => {
  const week = [
    act({ category: 'work', startAt: at('2026-08-31', '08:00'), endAt: at('2026-08-31', '08:00') + 60 * H, id: 'w' }),
  ];
  const r = pick(at(SUN, '19:05'), { week });
  assert.match(r!.text, /\([+-]\d+%\)/, 'phải kèm phần trăm lệch');
});

// --- Ưu tiên: tối đa MỘT nhắc ----------------------------------------

test('CN 20:50 chưa học tối → nhắc tối thắng tổng kết (nhắc mới nhất)', () => {
  const r = pick(at(SUN, '20:50'));
  assert.equal(r?.type, 'evening');
});

test('bỏ qua nhắc tối thì tổng kết tuần lên thay', () => {
  const r = pick(at(SUN, '20:50'), { isDismissed: (k) => k.includes('evening') });
  assert.equal(r?.type, 'weekly');
});

test('nhắc tối thắng nhắc sáng', () => {
  assert.equal(pick(at(WED, '21:00'))?.type, 'evening');
});

// --- Dismiss ----------------------------------------------------------

test('khoá dismiss gắn với ngày logic', () => {
  assert.equal(pick(at(WED, '06:20'))?.key, `reminder:morning:${WED}`);
  assert.equal(pick(at(SUN, '19:05'))?.key, `reminder:weekly:${SUN}`);
});

test('dismiss rồi thì im trong ngày đó', () => {
  const seen: string[] = [];
  const isDismissed = (k: string) => {
    seen.push(k);
    return true;
  };
  assert.equal(pick(at(WED, '06:20'), { isDismissed }), null);
  assert.deepEqual(seen, [`reminder:morning:${WED}`]);
});

test('sang ngày logic mới thì nhắc lại', () => {
  const dismissed = new Set([`reminder:morning:${WED}`, `reminder:evening:${WED}`]);
  const isDismissed = (k: string) => dismissed.has(k);
  assert.equal(pick(at(WED, '06:20'), { isDismissed }), null);
  // 03:00 hôm sau vẫn là ngày logic cũ — chưa qua mốc 04:00.
  assert.equal(pick(at('2026-09-03', '03:00'), { isDismissed }), null);
  assert.equal(pick(at('2026-09-03', '06:20'), { isDismissed })?.type, 'morning');
});

test('02:00 vẫn là "tối nay" — nhắc tối chưa tắt', () => {
  // Ngày logic chạy tới 04:00, nên thức khuya vẫn thuộc hôm qua.
  const r = pick(at('2026-09-03', '02:00'));
  assert.equal(r?.type, 'evening');
  assert.equal(r?.key, `reminder:evening:${WED}`);
});

// --- Không có target -------------------------------------------------

test('chưa có weekTarget vẫn nhắc được, chỉ bỏ phần số', () => {
  const r: Reminder | null = pick(at(WED, '20:50'), { weekly: null });
  assert.equal(r?.text, 'Evening study not logged yet.');
});
