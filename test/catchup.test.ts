import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DAY_CAP, catchUp, dayCap, dowAt, isWeekend, weekPos } from '@/lib/catchup';
import { dailyTargetFor } from '@/lib/day-target';
import { BASELINE_DAILY, CATEGORIES, PRESETS, type Category } from '@/types/logi';

const zero = (): Record<Category, number> =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

const W = PRESETS.normal.weekly;

// dow: 0 = CN … 6 = T7
const [SUN, MON, TUE, WED, THU, FRI, SAT] = [0, 1, 2, 3, 4, 5, 6];

// --- vị trí trong tuần -------------------------------------------------------

test('weekPos: tuần chạy T2 → CN, không phải CN → T7', () => {
  assert.equal(weekPos(MON), 0);
  assert.equal(weekPos(SAT), 5);
  assert.equal(weekPos(SUN), 6, 'Chủ nhật là ngày cuối, không phải ngày đầu');
});

test('dowAt là nghịch đảo của weekPos', () => {
  for (let dow = 0; dow < 7; dow++) assert.equal(dowAt(weekPos(dow)), dow);
});

test('isWeekend chỉ đúng với T7 và CN', () => {
  assert.deepEqual(
    [SUN, MON, TUE, WED, THU, FRI, SAT].map(isWeekend),
    [true, false, false, false, false, false, true]
  );
});

test('dayCap: trần cuối tuần của Learn cao hơn standard cuối tuần (8h)', () => {
  assert.ok(dayCap('learn', SAT) > BASELINE_DAILY.learn[SAT], 'trần thấp hơn chuẩn thì vô lý');
  assert.ok(dayCap('learn', SUN) > BASELINE_DAILY.learn[SUN]);
});

test('dayCap: trần ngày thường của Work vẫn trên 9.5h (8h + 1.5h đi lại)', () => {
  assert.ok(dayCap('work', TUE) >= BASELINE_DAILY.work[TUE], 'T3/T5 là ngày lên văn phòng');
});

// --- đúng kế hoạch thì kế hoạch không trôi -----------------------------------

test('làm đúng gợi ý mỗi ngày → ngày sau ra đúng con số đã dự tính từ đầu', () => {
  // Bắt đầu sạch từ thứ Hai, không nợ không dư.
  const first = catchUp(W, zero(), MON);
  const plannedTue = catchUp(W, { ...zero(), learn: first.learn.suggested }, TUE);

  // Thứ Hai làm đúng gợi ý → thứ Ba phải bằng gợi ý của một tuần sạch.
  const cleanTue = catchUp(W, zero(), MON); // để lấy hình dạng
  assert.ok(cleanTue.learn.suggested > 0);
  assert.equal(
    +plannedTue.learn.suggested.toFixed(1),
    +dailyTargetFor(TUE, W).learn.toFixed(1),
    'đi đúng kế hoạch thì gợi ý phải trùng standard'
  );
});

test('tuần sạch từ thứ Hai → gợi ý trùng standard ở mọi category', () => {
  const p = catchUp(W, zero(), MON);
  for (const c of CATEGORIES) {
    assert.equal(+p[c].suggested.toFixed(1), +p[c].standard.toFixed(1), c);
  }
});

test('đi đúng kế hoạch tới giữa tuần → gợi ý vẫn là standard', () => {
  // Log đúng standard cho T2, T3, T4 rồi hỏi thứ Năm.
  const before = zero();
  for (const dow of [MON, TUE, WED]) {
    const d = dailyTargetFor(dow, W);
    for (const c of CATEGORIES) before[c] += d[c];
  }
  const p = catchUp(W, before, THU);
  for (const c of CATEGORIES) {
    assert.equal(+p[c].suggested.toFixed(1), +p[c].standard.toFixed(1), c);
  }
});

// --- bù và giảm --------------------------------------------------------------

test('thứ Hai học vượt → thứ Ba gợi ý thấp hơn standard', () => {
  const p = catchUp(W, { ...zero(), learn: 10 }, TUE);
  assert.ok(p.learn.suggested < p.learn.standard, `${p.learn.suggested} phải < ${p.learn.standard}`);
  assert.equal(p.learn.remaining, +(W.learn - 10).toFixed(1));
});

test('bỏ trắng đầu tuần → gợi ý cao hơn standard', () => {
  const p = catchUp(W, zero(), THU); // T2, T3, T4 không log gì
  assert.ok(p.learn.suggested > p.learn.standard, 'nợ 3 ngày mà vẫn đòi 3h thì bù kiểu gì');
});

test('tổng các gợi ý còn lại = phần còn nợ, nếu không chạm trần', () => {
  const before = { ...zero(), learn: 5 };
  let sum = 0;
  let done = { ...before };
  for (let pos = weekPos(WED); pos <= 6; pos++) {
    const p = catchUp(W, done, dowAt(pos));
    sum += p.learn.suggested;
    done = { ...done, learn: done.learn + p.learn.suggested };
  }
  assert.ok(Math.abs(sum - (W.learn - 5)) < 0.15, `tổng ${sum} vs nợ ${W.learn - 5}`);
});

// --- xong rồi thì thôi -------------------------------------------------------

test('đủ target tuần → met, gợi ý 0, không đòi thêm', () => {
  const p = catchUp(W, { ...zero(), learn: W.learn }, WED);
  assert.equal(p.learn.met, true);
  assert.equal(p.learn.suggested, 0);
});

test('vượt target tuần → vẫn met, không ra số âm', () => {
  const p = catchUp(W, { ...zero(), learn: W.learn + 20 }, WED);
  assert.equal(p.learn.met, true);
  assert.equal(p.learn.remaining, 0);
  assert.equal(p.learn.suggested, 0);
});

test('target tuần bằng 0 → không phải "met", chỉ là không có việc', () => {
  const weekly = { ...W, fitness: 0 };
  const p = catchUp(weekly, zero(), WED);
  assert.equal(p.fitness.met, false, 'gắn dấu xong cho việc chưa từng có là nói dối');
  assert.equal(p.fitness.suggested, 0);
});

// --- ngày nghỉ của category --------------------------------------------------

test('Fitness Chủ nhật là ngày nghỉ → nợ bao nhiêu cũng không đẩy vào', () => {
  assert.equal(BASELINE_DAILY.fitness[SUN], 0, 'giả định của test');
  const p = catchUp(W, zero(), SUN); // nợ cả 9h fitness
  assert.equal(p.fitness.suggested, 0);
});

test('Work cuối tuần là ngày nghỉ → không bảo đi làm bù', () => {
  assert.equal(BASELINE_DAILY.work[SAT], 0, 'giả định của test');
  const p = catchUp(W, zero(), SAT);
  assert.equal(p.work.suggested, 0, 'nợ 43h Work không phải lý do để làm thứ Bảy');
});

test('Learn dồn hết vào cuối tuần khi chỉ còn T7 và CN', () => {
  const before = { ...zero(), learn: 5 };
  const sat = catchUp(W, before, SAT);
  const shape = BASELINE_DAILY.learn;
  const want = (W.learn - 5) * (shape[SAT] / (shape[SAT] + shape[SUN]));
  assert.equal(+sat.learn.suggested.toFixed(1), +Math.min(want, dayCap('learn', SAT)).toFixed(1));
});

// --- trần --------------------------------------------------------------------

test('nợ nhiều mà còn ít ngày → chạm trần, không bảo học 20h', () => {
  const p = catchUp(W, zero(), FRI); // nợ gần cả tuần Learn, còn T6/T7/CN
  const cap = dayCap('learn', FRI);
  assert.ok(p.learn.suggested <= cap + 1e-9, `${p.learn.suggested} vượt trần ${cap}`);
});

test('chạm trần thì có cờ capped, không thì không', () => {
  const hard = catchUp(W, zero(), SUN); // dồn hết vào Chủ nhật
  assert.equal(hard.learn.capped, true);
  assert.equal(hard.learn.suggested, DAY_CAP.learn.weekend);

  const easy = catchUp(W, zero(), MON);
  assert.equal(easy.learn.capped, false, 'tuần sạch không việc gì phải chạm trần');
});

test('target tuần cao → trần nhường chuẩn, kế hoạch đúng vẫn với tới target', () => {
  // Learn 49h/tuần: chuẩn thứ Bảy là 12.6h, cao hơn trần cứng 10h.
  const weekly = { ...W, learn: 49 };
  const std = dailyTargetFor(SAT, weekly).learn;
  assert.ok(std > DAY_CAP.learn.weekend, 'giả định của test');

  // Đi ĐÚNG kế hoạch tới hết thứ Sáu, rồi hỏi thứ Bảy - không nợ gì cả.
  const onPlan = zero();
  for (const dow of [MON, TUE, WED, THU, FRI]) {
    for (const c of CATEGORIES) onPlan[c] += dailyTargetFor(dow, weekly)[c];
  }
  const p = catchUp(weekly, onPlan, SAT);
  assert.equal(p.learn.capped, false, 'trần không được cãi lại chính kế hoạch');
  assert.equal(+p.learn.suggested.toFixed(1), +std.toFixed(1));

  // Đi đúng gợi ý cả tuần thì phải log đủ 49h, không hụt vì trần.
  let done = zero();
  let sum = 0;
  for (let pos = 0; pos <= 6; pos++) {
    const day = catchUp(weekly, done, dowAt(pos)).learn;
    assert.equal(day.capped, false, `ngày ${pos} báo chạm trần dù đi đúng kế hoạch`);
    sum += day.suggested;
    done = { ...done, learn: done.learn + day.suggested };
  }
  assert.ok(Math.abs(sum - 49) < 0.15, `đi đúng kế hoạch mà chỉ ra ${sum}/49`);
});

test('mọi tình huống: gợi ý không bao giờ vượt trần và không bao giờ âm', () => {
  for (const preset of Object.values(PRESETS)) {
    for (let dow = 0; dow < 7; dow++) {
      for (const doneRatio of [0, 0.25, 0.5, 1, 2]) {
        const before = Object.fromEntries(
          CATEGORIES.map((c) => [c, preset.weekly[c] * doneRatio])
        ) as Record<Category, number>;
        const p = catchUp(preset.weekly, before, dow);
        for (const c of CATEGORIES) {
          assert.ok(p[c].suggested >= 0, `${c} âm`);
          // Trần nhường chuẩn, và `suggested` làm tròn 0.1 nên trần cũng phải tròn.
          const std = Math.round(dailyTargetFor(dow, preset.weekly)[c] * 10) / 10;
          const cap = Math.max(dayCap(c, dow), std);
          assert.ok(p[c].suggested <= cap + 1e-9, `${c} vượt trần ở dow ${dow}`);
        }
      }
    }
  }
});

// --- số ngày còn lại ---------------------------------------------------------

test('daysLeft: thứ Hai còn 7, Chủ nhật còn 1', () => {
  assert.equal(catchUp(W, zero(), MON).learn.daysLeft, 7);
  assert.equal(catchUp(W, zero(), SUN).learn.daysLeft, 1);
});
