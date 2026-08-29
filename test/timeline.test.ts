import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayWindow, addDays, layoutDay, coverageOfDay, toPx, HOUR_PX } from '@/lib/timeline';
import { act, at, H } from './_helpers.ts';

test('dayWindow chạy từ 04:00 tới 04:00 hôm sau', () => {
  const w = dayWindow('2026-08-26');
  assert.equal(w.start, at('2026-08-26', '04:00'));
  assert.equal(w.end, at('2026-08-27', '04:00'));
  assert.equal(w.end - w.start, 24 * H);
});

test('addDays vượt qua đầu tháng và đầu năm', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-08-26', -30), '2026-07-27');
});

test('toPx: 04:00 là 0, mỗi giờ là HOUR_PX', () => {
  const w = dayWindow('2026-08-26');
  assert.equal(toPx(w.start, w), 0);
  assert.equal(toPx(w.start + H, w), HOUR_PX);
});

// --- Lane (mục 13: hai record chồng nhau) ----------------------------

test('layoutDay: hai block chồng nhau nằm ở hai lane', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '12:00') });
  const l = layoutDay([a, b], w, now);
  assert.equal(l.laneCount, 2);
  assert.deepEqual(l.segments.map((s) => s.lane), [0, 1]);
});

test('layoutDay: block cách xa nhau dùng chung lane 0', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '10:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '14:00'), endAt: at('2026-08-26', '15:00') });
  const l = layoutDay([a, b], w, now);
  assert.equal(l.laneCount, 1);
  assert.deepEqual(l.segments.map((s) => s.lane), [0, 0]);
});

test('layoutDay: hai block 5 phút liền nhau không đè lên nhau', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '09:05') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '09:05'), endAt: at('2026-08-26', '09:10') });
  const l = layoutDay([a, b], w, now);
  assert.equal(l.laneCount, 2, 'block quá ngắn nên phải tách lane cho dễ bấm');
});

test('layoutDay: session tràn qua 04:00 KHÔNG bị cắt (một giấc ngủ = một hàng)', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-27', '10:00');
  const sleep = act({
    category: 'sleep',
    startAt: at('2026-08-26', '22:00'),
    endAt: at('2026-08-27', '06:00'),
  });
  const [s] = layoutDay([sleep], w, now).segments;
  assert.equal(s.end, at('2026-08-27', '06:00'), 'giữ nguyên giờ kết thúc thật');
  assert.equal(s.crossesMidnight, true);
});

test('layoutDay: session đang chạy kết thúc ở now', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '15:30');
  const a = act({ startAt: at('2026-08-26', '14:00'), endAt: null });
  const [s] = layoutDay([a], w, now).segments;
  assert.equal(s.end, now);
  assert.equal(s.crossesMidnight, false);
});

test('layoutDay: bỏ record nằm ngoài cửa sổ ngày', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '23:00');
  const a = act({ startAt: at('2026-08-25', '09:00'), endAt: at('2026-08-25', '10:00') });
  assert.equal(layoutDay([a], w, now).segments.length, 0);
});

// --- Coverage --------------------------------------------------------

test('coverageOfDay gộp phần chồng nhau khi tính trackedH', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '12:00') });
  const { segments } = layoutDay([a, b], w, now);
  const c = coverageOfDay(segments, w, now);
  assert.equal(c.trackedH, 3, '09:00–12:00 = 3h, không phải 4h');
  assert.equal(c.untrackedH, 5, '04:00–09:00 chưa log');
});

test('coverageOfDay không tính tương lai là untracked', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '05:00');
  const c = coverageOfDay([], w, now);
  assert.equal(c.trackedH, 0);
  assert.equal(c.untrackedH, 1, 'chỉ 04:00–05:00, 19h còn lại là tương lai');
});

test('coverageOfDay chỉ báo khoảng trống từ 30 phút trở lên', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '04:00'), endAt: at('2026-08-26', '09:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '09:20'), endAt: at('2026-08-26', '12:00') });
  const { segments } = layoutDay([a, b], w, now);
  assert.equal(coverageOfDay(segments, w, now).gaps.length, 0, 'khoảng 20 phút bị bỏ qua');
});

// --- A2 (đã sửa bởi AMENDMENT sleep-boundary) --------------------------
test('layoutDay: record bình thường trong ngày → crossesMidnight = false', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const [s] = layoutDay([a], w, now).segments;
  assert.equal(s.crossesMidnight, false);
});

test('layoutDay: session hôm trước kết thúc trước 04:00 thì không vẽ', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({
    startAt: at('2026-08-25', '20:00'),
    endAt: at('2026-08-25', '23:00'),
  });
  assert.equal(layoutDay([a], w, now).segments.length, 0);
});
