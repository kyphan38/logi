import assert from 'node:assert/strict';
import { test } from 'node:test';

import { logicalDate } from '@/lib/balance';
import { asleepUntil, coverageOfDay, dayWindow, layoutDay } from '@/lib/timeline';
import { act, at } from './_helpers.ts';

// ---------------------------------------------------------------------------
// AMENDMENT sleep-boundary: một giấc ngủ là MỘT hàng, ở đúng ngày logic của
// nó. Ngày hôm sau chỉ có dòng mảnh "Asleep until ...", không phải block và
// không phải untracked.
// ---------------------------------------------------------------------------

const MON = '2026-08-24';
const TUE = '2026-08-25';

test('ngủ 22:00 T2 → 04:30 T3: một segment ở ngày logic T2, có cờ crossesMidnight', () => {
  const win = dayWindow(MON);
  const now = at(TUE, '12:00');
  const sleep = act({
    category: 'sleep',
    startAt: at(MON, '22:00'),
    endAt: at(TUE, '04:30'),
  });

  const { segments } = layoutDay([sleep], win, now);

  assert.equal(segments.length, 1, 'không được cắt làm hai khối');
  assert.equal(segments[0].start, at(MON, '22:00'));
  assert.equal(segments[0].end, at(TUE, '04:30'), 'giữ nguyên giờ dậy thật');
  assert.equal(segments[0].crossesMidnight, true);
});

test('ngủ 00:15 → 07:30 T3: một segment, logicalDate là ngày hôm trước', () => {
  const sleep = act({
    category: 'sleep',
    startAt: at(TUE, '00:15'),
    endAt: at(TUE, '07:30'),
  });

  assert.equal(sleep.logicalDate, MON, 'bắt đầu trước 04:00 nên thuộc T2');
  assert.equal(logicalDate(sleep.startAt), MON);

  const { segments } = layoutDay([sleep], dayWindow(MON), at(TUE, '12:00'));
  assert.equal(segments.length, 1);
  assert.equal(segments[0].end, at(TUE, '07:30'));
  assert.equal(segments[0].crossesMidnight, false, 'ngủ và dậy cùng một ngày lịch');

  // Và ngày T3 không có block nào của giấc ngủ đó.
  assert.equal(layoutDay([], dayWindow(TUE), at(TUE, '12:00')).segments.length, 0);
});

test('ngày hôm sau: có hàng asleepUntil, đúng giờ dậy', () => {
  const win = dayWindow(TUE);
  const now = at(TUE, '12:00');
  const sleep = act({
    category: 'sleep',
    startAt: at(TUE, '00:15'),
    endAt: at(TUE, '07:30'),
  });

  const row = asleepUntil([sleep], win, now);
  assert.ok(row, 'phải có dòng "Asleep until"');
  assert.equal(row.end, at(TUE, '07:30'));
  assert.equal(row.activity.id, sleep.id);
});

test('giấc ngủ kết thúc trước 04:00 thì không có hàng asleepUntil', () => {
  const win = dayWindow(TUE);
  const sleep = act({
    category: 'sleep',
    startAt: at(MON, '21:00'),
    endAt: at(TUE, '03:30'),
  });
  assert.equal(asleepUntil([sleep], win, at(TUE, '12:00')), null);
});

test('chỉ Sleep mới sinh hàng asleepUntil, việc khác thì không', () => {
  const win = dayWindow(TUE);
  const work = act({
    category: 'work',
    startAt: at(TUE, '01:00'),
    endAt: at(TUE, '05:00'),
  });
  assert.equal(asleepUntil([work], win, at(TUE, '12:00')), null);
});

test('không có untracked trước giờ dậy; coverage trừ đúng khoảng còn ngủ', () => {
  const win = dayWindow(TUE);
  const now = at(TUE, '12:00');
  const sleep = act({
    category: 'sleep',
    startAt: at(TUE, '00:15'),
    endAt: at(TUE, '07:30'),
  });
  const learn = act({
    id: 'l',
    category: 'learn',
    startAt: at(TUE, '07:30'),
    endAt: at(TUE, '10:00'),
  });

  const { segments } = layoutDay([learn], win, now);
  const row = asleepUntil([sleep], win, now);
  assert.ok(row);

  const cov = coverageOfDay(segments, win, now, row.end);

  assert.equal(cov.trackedH, 2.5);
  // Ngày thật sự bắt đầu lúc 07:30 → chỉ còn 10:00–12:00 là chưa log.
  assert.equal(cov.untrackedH, 2);
  assert.equal(cov.gaps.length, 1);
  assert.equal(cov.gaps[0].start, at(TUE, '10:00'));
  assert.equal(cov.gaps[0].end, now);

  // Không truyền giờ dậy thì khoảng 04:00–07:30 lại thành "quên log".
  const raw = coverageOfDay(segments, win, now);
  assert.equal(raw.untrackedH, 5.5);
  assert.equal(raw.gaps[0].start, win.start);
});
