import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayWindow, addDays, layoutDay, dayGaps, toPx, HOUR_PX } from '@/lib/timeline';
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

test('layoutDay: session tràn qua 04:00 KHÔNG bị cắt (một ca đêm = một hàng)', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-27', '10:00');
  const night = act({
    category: 'work',
    startAt: at('2026-08-26', '22:00'),
    endAt: at('2026-08-27', '06:00'),
  });
  const [s] = layoutDay([night], w, now).segments;
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

// --- Khoảng trống trong ngày (AMENDMENT-remove-sleep mục 6) -----------

test('dayGaps gộp phần chồng nhau khi tính trackedH', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '10:00'), endAt: at('2026-08-26', '12:00') });
  const { segments } = layoutDay([a, b], w, now);
  const c = dayGaps(segments, w, now);
  assert.equal(c.trackedH, 3, '09:00–12:00 = 3h, không phải 4h');
  assert.equal(c.gapH, 0, '04:00–09:00 nằm trước record đầu tiên → không tính');
});

test('dayGaps: phần trước record đầu và sau record cuối không thành gap', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-28', '12:00'); // đang xem ngày cũ
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const c = dayGaps(layoutDay([a], w, now).segments, w, now);
  assert.equal(c.gapH, 0);
  assert.equal(c.gaps.length, 0, 'không có dòng "17h untracked" ở cuối');
  assert.equal(c.from, at('2026-08-26', '09:00'));
  assert.equal(c.to, at('2026-08-26', '11:00'));
});

test('dayGaps: hôm nay thì mép phải kéo tới now → khoảng vừa trôi qua là gap', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const c = dayGaps(layoutDay([a], w, now).segments, w, now);
  assert.equal(c.gapH, 1, '11:00 → 12:00 đúng là chưa log');
  assert.equal(c.gaps.length, 1);
});

test('dayGaps: khoảng GIỮA hai record thì vẫn tính', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '18:00');
  const a = act({ startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '11:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '14:00'), endAt: at('2026-08-26', '18:00') });
  const c = dayGaps(layoutDay([a, b], w, now).segments, w, now);
  assert.equal(c.trackedH, 6);
  assert.equal(c.gapH, 3, '11:00 → 14:00');
  assert.equal(c.gaps.length, 1);
});

test('dayGaps: ngày trống hoàn toàn → không có mốc nào', () => {
  const w = dayWindow('2026-08-26');
  const c = dayGaps([], w, at('2026-08-26', '05:00'));
  assert.equal(c.trackedH, 0);
  assert.equal(c.gapH, 0);
  assert.equal(c.from, null);
  assert.equal(c.to, null);
});

test('dayGaps chỉ báo khoảng trống từ 30 phút trở lên', () => {
  const w = dayWindow('2026-08-26');
  const now = at('2026-08-26', '12:00');
  const a = act({ startAt: at('2026-08-26', '04:00'), endAt: at('2026-08-26', '09:00') });
  const b = act({ id: 'b', startAt: at('2026-08-26', '09:20'), endAt: at('2026-08-26', '12:00') });
  const { segments } = layoutDay([a, b], w, now);
  assert.equal(dayGaps(segments, w, now).gaps.length, 0, 'khoảng 20 phút bị bỏ qua');
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
