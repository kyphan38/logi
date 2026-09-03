// ---------------------------------------------------------------------------
// Stage 8 - lưới task tuần.
//
// Bài test quan trọng nhất ở file này là "bản chụp": đổi thời lượng trong pool
// KHÔNG được đổi kết quả của tuần đã lên kế hoạch. Nếu nó hỏng, lịch sử tự
// viết lại và không ai nhận ra.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GRID_DOWS,
  cellAt,
  checklistFor,
  clearDow,
  completionRate,
  countOfDow,
  dateOfCell,
  dayIsFull,
  expandPlan,
  minutesForTask,
  overTargetWarnings,
  paintRow,
  plannedHoursByCategory,
  shortDuration,
  snapshotOf,
  tallyTasks,
  toggleCell,
} from '@/lib/tasks';
import { BASELINE_WEEKLY, type Category, type PlannedCell, type PoolTask } from '@/types/logi';

import { act, at } from './_helpers.ts';

function task(o: Partial<PoolTask> & { id: string }): PoolTask {
  return {
    id: o.id,
    title: o.title ?? o.id,
    durationMin: o.durationMin ?? 30,
    category: (o.category ?? 'learn') as Category,
    order: o.order ?? 0,
    archivedAt: o.archivedAt ?? null,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Bật một loạt ô cho gọn. */
function grid(pairs: Array<[PoolTask, number]>): PlannedCell[] {
  let cells: PlannedCell[] = [];
  for (const [t, dow] of pairs) {
    const r = toggleCell(cells, t, dow);
    assert.ok(r.ok, `không bật được ${t.id}/${dow}`);
    cells = r.cells;
  }
  return cells;
}

// ---------------------------------------------------------------------------

describe('shortDuration', () => {
  it('dưới 1 tiếng thì chỉ có phút', () => {
    assert.equal(shortDuration(45), '45m');
    assert.equal(shortDuration(5), '5m');
  });

  it('tròn tiếng thì bỏ phần phút', () => {
    assert.equal(shortDuration(120), '2h');
  });

  it('lẻ thì hiện cả hai', () => {
    assert.equal(shortDuration(90), '1h 30m');
  });
});

describe('bật / tắt ô', () => {
  const run = task({ id: 't1', title: 'Running', durationMin: 45, category: 'fitness' });

  it('chạm lần đầu bật, chạm lại tắt', () => {
    const on = toggleCell([], run, 1);
    assert.ok(on.ok && on.turnedOn);
    assert.equal(on.cells.length, 1);

    const off = toggleCell(on.cells, run, 1);
    assert.ok(off.ok && !off.turnedOn);
    assert.equal(off.cells.length, 0);
  });

  it('không đụng tới ô của ngày khác', () => {
    const cells = grid([
      [run, 1],
      [run, 3],
    ]);
    const off = toggleCell(cells, run, 1);
    assert.ok(off.ok);
    assert.equal(off.cells.length, 1);
    assert.equal(off.cells[0].dow, 3);
  });

  it('quá 3 task/ngày là CHẶN CỨNG, không phải cảnh báo', () => {
    const cells = grid([
      [task({ id: 'a' }), 2],
      [task({ id: 'b' }), 2],
      [task({ id: 'c' }), 2],
    ]);
    assert.ok(dayIsFull(cells, 2));

    const r = toggleCell(cells, task({ id: 'd' }), 2);
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /Max 3 per day/);
  });

  it('ngày đã đầy vẫn TẮT được - nếu không thì kẹt luôn', () => {
    const c = task({ id: 'c' });
    const cells = grid([
      [task({ id: 'a' }), 2],
      [task({ id: 'b' }), 2],
      [c, 2],
    ]);
    const r = toggleCell(cells, c, 2);
    assert.ok(r.ok && !r.turnedOn);
    assert.equal(countOfDow(r.cells, 2), 2);
  });

  it('không sửa mảng cũ - undo dựa vào điều này', () => {
    const cells: PlannedCell[] = [];
    toggleCell(cells, run, 1);
    assert.equal(cells.length, 0);
  });
});

describe('bản chụp lúc gán (quyết định 14)', () => {
  it('ô giữ title / durationMin / category của thời điểm bật', () => {
    const t = task({ id: 't1', title: 'Running', durationMin: 45, category: 'fitness' });
    const cell = snapshotOf(t, 1);
    assert.deepEqual(cell, {
      taskId: 't1',
      dow: 1,
      title: 'Running',
      durationMin: 45,
      category: 'fitness',
    });
  });

  it('đổi pool 45 → 30 KHÔNG làm ngày cũ thành "đã xong"', () => {
    const before = task({ id: 't1', title: 'Running', durationMin: 45 });
    const cells = grid([[before, 1]]);

    // Người dùng sửa task trong pool. Object mới, doc Firestore đã đổi.
    const after = task({ id: 't1', title: 'Running', durationMin: 30 });
    assert.equal(after.durationMin, 30);

    // Tuần đã lên kế hoạch vẫn đọc 45 - checklist tính theo ô, không theo pool.
    const done35 = [
      act({ id: 's1', taskId: 't1', category: 'learn', startAt: at('2026-08-26', '09:00'), endAt: at('2026-08-26', '09:35') }),
    ];
    const rows = checklistFor(cells, done35, '2026-08-26', 1, at('2026-08-26', '10:00'));
    assert.equal(rows[0].durationMin, 45);
    assert.equal(rows[0].done, false, '35 phút không đủ cho bản chụp 45 phút');
  });

  it('bật lại ô mới là cách duy nhất lấy giá trị mới', () => {
    const before = task({ id: 't1', durationMin: 45 });
    let cells = grid([[before, 1]]);

    const after = task({ id: 't1', durationMin: 30 });
    cells = (toggleCell(cells, after, 1) as { cells: PlannedCell[] }).cells;
    cells = (toggleCell(cells, after, 1) as { cells: PlannedCell[] }).cells;

    assert.equal(cellAt(cells, 't1', 1)?.durationMin, 30);
  });
});

describe('tô cả hàng', () => {
  const t = task({ id: 't1' });

  it('bật đủ 7 ngày', () => {
    const r = paintRow([], t, GRID_DOWS, true);
    assert.equal(r.cells.length, 7);
    assert.equal(r.blocked, 0);
  });

  it('ngày đầy thì bỏ qua ngày đó, các ngày kia vẫn bật', () => {
    const full = grid([
      [task({ id: 'a' }), 3],
      [task({ id: 'b' }), 3],
      [task({ id: 'c' }), 3],
    ]);
    const r = paintRow(full, t, GRID_DOWS, true);
    assert.equal(r.blocked, 1);
    assert.equal(cellAt(r.cells, 't1', 3), null);
    assert.equal(cellAt(r.cells, 't1', 1)?.taskId, 't1');
    assert.equal(r.cells.filter((c) => c.taskId === 't1').length, 6);
  });

  it('tô lại ô đã bật không tạo bản trùng', () => {
    const once = paintRow([], t, GRID_DOWS, true).cells;
    const twice = paintRow(once, t, GRID_DOWS, true).cells;
    assert.equal(twice.length, 7);
  });

  it('tắt cả hàng chỉ đụng task đó', () => {
    let cells = paintRow([], t, GRID_DOWS, true).cells;
    cells = paintRow(cells, task({ id: 'other' }), [1, 2], true).cells;

    const off = paintRow(cells, t, GRID_DOWS, false).cells;
    assert.equal(off.length, 2);
    assert.ok(off.every((c) => c.taskId === 'other'));
  });
});

describe('clearDow', () => {
  it('chạm tên thứ → xoá sạch ngày đó, giữ nguyên ngày khác', () => {
    const cells = grid([
      [task({ id: 'a' }), 1],
      [task({ id: 'b' }), 1],
      [task({ id: 'a' }), 2],
    ]);
    const out = clearDow(cells, 1);
    assert.equal(out.length, 1);
    assert.equal(out[0].dow, 2);
  });
});

describe('cảnh báo vượt target', () => {
  it('cộng giờ dự kiến theo category', () => {
    const cells = grid([
      [task({ id: 'a', durationMin: 90, category: 'learn' }), 1],
      [task({ id: 'b', durationMin: 30, category: 'learn' }), 1],
      [task({ id: 'c', durationMin: 60, category: 'work' }), 1],
    ]);
    const h = plannedHoursByCategory(cells, 1);
    assert.equal(h.learn, 2);
    assert.equal(h.work, 1);
    assert.equal(h.fitness, 0);
  });

  it('dưới target thì im lặng', () => {
    // T2 target learn = 3h. 2h dự kiến.
    const cells = grid([[task({ id: 'a', durationMin: 120, category: 'learn' }), 1]]);
    assert.deepEqual(overTargetWarnings(cells, BASELINE_WEEKLY), []);
  });

  it('vượt thì nói rõ ngày nào, category nào', () => {
    const cells = grid([
      [task({ id: 'a', durationMin: 120, category: 'learn' }), 1],
      [task({ id: 'b', durationMin: 120, category: 'learn' }), 1],
    ]);
    const w = overTargetWarnings(cells, BASELINE_WEEKLY);
    assert.equal(w.length, 1);
    assert.equal(w[0].dow, 1);
    assert.equal(w[0].category, 'learn');
    assert.equal(w[0].text, 'Mon · Learn 4.0h planned vs 3.0h target');
  });

  it('một ngày vượt hai category → hai dòng', () => {
    const cells = grid([
      [task({ id: 'a', durationMin: 4 * 60, category: 'learn' }), 0],
      [task({ id: 'b', durationMin: 60, category: 'fitness' }), 0],
    ]);
    // CN: learn 8h target nên không vượt; fitness target 0h → vượt.
    const w = overTargetWarnings(cells, BASELINE_WEEKLY);
    assert.deepEqual(
      w.map((x) => x.category),
      ['fitness']
    );
  });

  it('chưa tải xong target thì không cảnh báo bừa', () => {
    const cells = grid([[task({ id: 'a', durationMin: 600, category: 'learn' }), 1]]);
    assert.deepEqual(overTargetWarnings(cells, null), []);
  });
});

describe('minutesForTask', () => {
  const D = '2026-08-26';
  const NOW = at(D, '10:00');

  it('chỉ cộng session có ĐÚNG taskId - không đoán theo label', () => {
    const acts = [
      act({ id: 's1', taskId: 't1', startAt: at(D, '08:00'), endAt: at(D, '08:30') }),
      act({ id: 's2', taskId: null, label: 'Running', startAt: at(D, '09:00'), endAt: at(D, '09:30') }),
    ];
    assert.equal(minutesForTask(acts, 't1', D, NOW), 30);
  });

  it('nhiều lần trong ngày thì cộng lại (quyết định 6)', () => {
    const acts = [
      act({ id: 's1', taskId: 't1', startAt: at(D, '08:00'), endAt: at(D, '08:20') }),
      act({ id: 's2', taskId: 't1', startAt: at(D, '09:00'), endAt: at(D, '09:25') }),
    ];
    assert.equal(minutesForTask(acts, 't1', D, NOW), 45);
  });

  it('session đang chạy tính tới bây giờ', () => {
    const acts = [act({ id: 's1', taskId: 't1', startAt: at(D, '09:40'), endAt: null })];
    assert.equal(minutesForTask(acts, 't1', D, NOW), 20);
  });

  it('ngày khác không lẫn vào - mỗi sáng đếm lại từ 0 (quyết định 8)', () => {
    const acts = [
      act({ id: 's1', taskId: 't1', startAt: at('2026-08-25', '08:00'), endAt: at('2026-08-25', '09:00') }),
    ];
    assert.equal(minutesForTask(acts, 't1', D, NOW), 0);
  });

  it('abandoned không tính', () => {
    const acts = [
      act({ id: 's1', taskId: 't1', startAt: at(D, '08:00'), endAt: at(D, '09:00'), status: 'abandoned' }),
    ];
    assert.equal(minutesForTask(acts, 't1', D, NOW), 0);
  });
});

describe('checklistFor', () => {
  const D = '2026-08-26'; // thứ Tư → dow 3
  const NOW = at(D, '10:00');
  const t1 = task({ id: 't1', title: 'Running', durationMin: 30, category: 'fitness' });

  it('chỉ lấy task của đúng thứ đó', () => {
    const cells = grid([
      [t1, 3],
      [task({ id: 't2' }), 4],
    ]);
    const rows = checklistFor(cells, [], D, 3, NOW);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].taskId, 't1');
  });

  it('chưa làm gì → 0 / 30m, chưa xong', () => {
    const rows = checklistFor(grid([[t1, 3]]), [], D, 3, NOW);
    assert.equal(rows[0].label, '0 / 30m');
    assert.equal(rows[0].done, false);
    assert.equal(rows[0].fill, 0);
    assert.equal(rows[0].runningId, null);
  });

  it('làm được một nửa → thanh tiến độ 0.5', () => {
    const acts = [act({ id: 's1', taskId: 't1', startAt: at(D, '09:00'), endAt: at(D, '09:15') })];
    const rows = checklistFor(grid([[t1, 3]]), acts, D, 3, NOW);
    assert.equal(rows[0].label, '15 / 30m');
    assert.equal(rows[0].fill, 0.5);
    assert.equal(rows[0].done, false);
  });

  it('đủ thời lượng → xong; làm quá thì thanh dừng ở 1', () => {
    const acts = [act({ id: 's1', taskId: 't1', startAt: at(D, '08:00'), endAt: at(D, '09:00') })];
    const rows = checklistFor(grid([[t1, 3]]), acts, D, 3, NOW);
    assert.equal(rows[0].done, true);
    assert.equal(rows[0].fill, 1);
  });

  it('đang chạy thì trả id để hiện Stop', () => {
    const acts = [act({ id: 's1', taskId: 't1', startAt: at(D, '09:50'), endAt: null })];
    const rows = checklistFor(grid([[t1, 3]]), acts, D, 3, NOW);
    assert.equal(rows[0].runningId, 's1');
    assert.equal(rows[0].label, '10 / 30m');
  });
});

describe('dateOfCell', () => {
  it('T2..CN của tuần ISO ra đúng ngày', () => {
    assert.equal(dateOfCell('2026-W35', 1), '2026-08-24');
    assert.equal(dateOfCell('2026-W35', 3), '2026-08-26');
    assert.equal(dateOfCell('2026-W35', 6), '2026-08-29');
    assert.equal(dateOfCell('2026-W35', 0), '2026-08-30', 'CN là ngày CUỐI tuần ISO');
  });
});

describe('tallyTasks / completionRate', () => {
  const RANGE = { from: '2026-08-24', to: '2026-08-30' };
  const NOW = at('2026-08-30', '23:00');
  const t1 = task({ id: 't1', title: 'Running', durationMin: 30 });

  it('đếm ngày đã lên kế hoạch và ngày làm đủ', () => {
    const cells = grid([
      [t1, 1],
      [t1, 3],
      [t1, 5],
    ]);
    const acts = [
      act({ id: 's1', taskId: 't1', startAt: at('2026-08-24', '08:00'), endAt: at('2026-08-24', '08:35') }),
      act({ id: 's2', taskId: 't1', startAt: at('2026-08-26', '08:00'), endAt: at('2026-08-26', '08:10') }),
    ];
    const tallies = tallyTasks(expandPlan('2026-W35', cells), acts, RANGE, NOW);
    assert.equal(tallies.length, 1);
    assert.equal(tallies[0].planned, 3);
    assert.equal(tallies[0].completed, 1, '10 phút chưa đủ 30');
    assert.equal(completionRate(tallies), 1 / 3);
  });

  it('ngày chưa tới KHÔNG tính là bỏ', () => {
    const cells = grid([
      [t1, 1],
      [t1, 5],
    ]);
    // Bây giờ là thứ Ba. Thứ Sáu chưa xảy ra.
    const tallies = tallyTasks(expandPlan('2026-W35', cells), [], RANGE, at('2026-08-25', '12:00'));
    assert.equal(tallies[0].planned, 1);
  });

  it('không có ô nào → null, KHÔNG phải 0', () => {
    assert.equal(completionRate([]), null);
  });

  it('xếp task bị bỏ nhiều lên theo số ngày đã đặt', () => {
    const a = task({ id: 'a', title: 'A' });
    const b = task({ id: 'b', title: 'B' });
    const cells = grid([
      [a, 1],
      [b, 1],
      [b, 2],
    ]);
    const tallies = tallyTasks(expandPlan('2026-W35', cells), [], RANGE, NOW);
    assert.deepEqual(
      tallies.map((t) => t.taskId),
      ['b', 'a']
    );
  });
});
