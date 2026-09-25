import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countdownParts,
  countdownText,
  dateLabel,
  daysUntil,
  dueMilestone,
  isMilestone,
  splitEvents,
  urgency,
  whenLabel,
} from '@/lib/events';
import { MILESTONES, type EventItem } from '@/types/logi';
import { at } from './_helpers.ts';

function ev(o: Partial<EventItem> & { date: string }): EventItem {
  return {
    id: o.id ?? `e-${o.date}`,
    title: o.title ?? 'Something',
    date: o.date,
    time: o.time ?? null,
    note: o.note ?? null,
    notified: o.notified ?? {},
    archivedAt: null,
    createdAt: o.createdAt ?? 0,
    updatedAt: 0,
  };
}

// --- daysUntil: mốc cắt 04:00 ------------------------------------------

test('trong cùng ngày logic thì số ngày không đổi, dù mấy giờ', () => {
  const target = '2026-10-15';
  for (const t of ['04:00', '09:30', '18:00', '23:59']) {
    assert.equal(daysUntil(target, at('2026-10-12', t)), 3, `sai lúc ${t}`);
  }
});

test('01:00 vẫn thuộc ngày hôm trước - KHÔNG được nhảy sang mốc mới', () => {
  // 2026-10-13 lúc 01:00 vẫn là ngày logic 2026-10-12 → còn 3 ngày.
  assert.equal(daysUntil('2026-10-15', at('2026-10-13', '01:00')), 3);
  // 04:00 mới sang ngày mới.
  assert.equal(daysUntil('2026-10-15', at('2026-10-13', '04:00')), 2);
});

test('23:00 hôm trước ngày diễn ra vẫn là "còn 1 ngày", không phải 0', () => {
  assert.equal(daysUntil('2026-10-15', at('2026-10-14', '23:00')), 1);
  assert.equal(countdownText(daysUntil('2026-10-15', at('2026-10-14', '23:00'))), 'Tomorrow');
});

test('hôm nay = 0, đã qua = âm', () => {
  assert.equal(daysUntil('2026-10-15', at('2026-10-15', '12:00')), 0);
  assert.equal(daysUntil('2026-10-15', at('2026-10-18', '12:00')), -3);
});

test('vắt qua tháng và qua năm', () => {
  assert.equal(daysUntil('2026-11-01', at('2026-10-31', '12:00')), 1);
  assert.equal(daysUntil('2027-01-01', at('2026-12-25', '12:00')), 7);
  // 2028 là năm nhuận: 29/02 phải tồn tại.
  assert.equal(daysUntil('2028-03-01', at('2028-02-28', '12:00')), 2);
});

// --- Chữ ---------------------------------------------------------------

test('mốc 7 và 14 nói bằng tuần', () => {
  assert.equal(countdownText(14), 'In 2 weeks');
  assert.equal(countdownText(7), 'Next week');
  assert.equal(countdownText(3), 'In 3 days');
  assert.equal(countdownText(1), 'Tomorrow');
  assert.equal(countdownText(0), 'Today');
});

test('việc đã qua', () => {
  assert.equal(countdownText(-1), 'Yesterday');
  assert.equal(countdownText(-5), '5 days ago');
});

test('xa thì đổi đơn vị, không bao giờ in ra "In 400 days"', () => {
  assert.equal(countdownText(21), 'In 3 weeks');
  assert.equal(countdownText(90), 'In 3 months');
});

test('dateLabel không phụ thuộc múi giờ máy chạy', () => {
  // 2026-10-15 là thứ Tư.
  assert.equal(dateLabel('2026-10-15'), 'Thu, Oct 15');
  assert.equal(dateLabel('2026-01-01'), 'Thu, Jan 1');
  assert.equal(dateLabel('2026-12-31'), 'Thu, Dec 31');
});

// --- Mốc nhắc ----------------------------------------------------------

test('đúng mốc và chưa gửi → đến hạn', () => {
  const e = ev({ date: '2026-10-15' });
  assert.equal(dueMilestone(e, at('2026-10-01', '06:00')), 14);
  assert.equal(dueMilestone(e, at('2026-10-08', '06:00')), 7);
  assert.equal(dueMilestone(e, at('2026-10-12', '06:00')), 3);
  assert.equal(dueMilestone(e, at('2026-10-14', '06:00')), 1);
  assert.equal(dueMilestone(e, at('2026-10-15', '06:00')), 0);
});

test('đã gửi mốc đó rồi → im', () => {
  const e = ev({ date: '2026-10-15', notified: { '3': 1 } });
  assert.equal(dueMilestone(e, at('2026-10-12', '06:00')), null);
  // Mốc khác vẫn gửi bình thường.
  assert.equal(dueMilestone(e, at('2026-10-14', '06:00')), 1);
});

test('KHÔNG gửi bù: lỡ mất một ngày thì mốc đó trôi luôn', () => {
  const e = ev({ date: '2026-10-15' });
  // Còn 2 ngày, 6 ngày, 13 ngày đều không phải mốc.
  assert.equal(dueMilestone(e, at('2026-10-13', '06:00')), null);
  assert.equal(dueMilestone(e, at('2026-10-09', '06:00')), null);
  assert.equal(dueMilestone(e, at('2026-10-02', '06:00')), null);
});

test('việc đã qua không bao giờ đến hạn', () => {
  const e = ev({ date: '2026-10-15' });
  assert.equal(dueMilestone(e, at('2026-10-16', '06:00')), null);
});

test('MILESTONES giảm dần và có đủ 14/7/3/1/0', () => {
  assert.deepEqual([...MILESTONES], [14, 7, 3, 1, 0]);
  for (const m of MILESTONES) assert.ok(isMilestone(m));
  assert.equal(isMilestone(2), false);
});

// --- Sắp xếp -----------------------------------------------------------

test('sắp tới: gần nhất lên đầu. Đã qua: mới nhất lên đầu', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'far', date: '2026-11-20' }),
    ev({ id: 'old', date: '2026-10-01' }),
    ev({ id: 'soon', date: '2026-10-11' }),
    ev({ id: 'yesterday', date: '2026-10-09' }),
    ev({ id: 'today', date: '2026-10-10' }),
  ];
  const { upcoming, past } = splitEvents(list, now);
  assert.deepEqual(upcoming.map((e) => e.id), ['today', 'soon', 'far']);
  assert.deepEqual(past.map((e) => e.id), ['yesterday', 'old']);
});

test('hôm nay nằm ở khối SẮP TỚI, không phải đã qua', () => {
  const { upcoming, past } = splitEvents([ev({ date: '2026-10-10' })], at('2026-10-10', '23:00'));
  assert.equal(upcoming.length, 1);
  assert.equal(past.length, 0);
});

test('cùng ngày thì thứ tự ổn định theo lúc tạo', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'b', date: '2026-10-12', createdAt: 200 }),
    ev({ id: 'a', date: '2026-10-12', createdAt: 100 }),
  ];
  assert.deepEqual(splitEvents(list, now).upcoming.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(splitEvents([...list].reverse(), now).upcoming.map((e) => e.id), ['a', 'b']);
});

test('urgency đổi đúng chỗ', () => {
  assert.equal(urgency(-1), 'past');
  assert.equal(urgency(0), 'today');
  assert.equal(urgency(1), 'soon');
  assert.equal(urgency(3), 'near');
  assert.equal(urgency(4), 'far');
});

// --- Khối số trên mỗi dòng ---------------------------------------------

test('countdownParts khớp countdownText ở mọi mốc, không nói hai kiểu', () => {
  // "7 days" ở danh sách trong khi push ghi "Next week" là bắt người dùng
  // dừng lại đối chiếu. Hai hàm phải cùng chọn một đơn vị.
  const unitOf = (n: number) => {
    const t = countdownText(n);
    // "Today" chứa chuỗi con "day" - phải xét trước mọi phép includes().
    if (t === 'Today') return 'today';
    if (t.includes('week')) return 'week';
    if (t.includes('month')) return 'month';
    if (t.includes('day') || t === 'Tomorrow' || t === 'Yesterday') return 'day';
    return 'today';
  };
  for (let n = -400; n <= 400; n++) {
    const { value, unit } = countdownParts(n);
    const expect = unitOf(n);
    const got = unit === '' ? 'today' : unit.startsWith('week') ? 'week' : unit.startsWith('month') ? 'month' : 'day';
    assert.equal(got, expect, `lệch đơn vị tại ${n} ngày: "${value} ${unit}" vs "${countdownText(n)}"`);
  }
});

test('khối số ở các mốc chính', () => {
  assert.deepEqual(countdownParts(14), { value: '2', unit: 'weeks' });
  assert.deepEqual(countdownParts(7), { value: '1', unit: 'week' });
  assert.deepEqual(countdownParts(3), { value: '3', unit: 'days' });
  assert.deepEqual(countdownParts(1), { value: '1', unit: 'day' });
  assert.deepEqual(countdownParts(0), { value: 'Today', unit: '' });
  assert.deepEqual(countdownParts(-1), { value: '1', unit: 'day ago' });
});

test('số trong khối luôn ngắn - không bao giờ tràn ô', () => {
  for (let n = -400; n <= 400; n++) {
    const { value } = countdownParts(n);
    assert.ok(value.length <= 5, `"${value}" quá dài tại ${n} ngày`);
  }
});

// --- Giờ trong ngày ----------------------------------------------------

test('có giờ thì ghép vào sau ngày; không có thì chỉ ngày', () => {
  assert.equal(whenLabel('2026-10-26', '11:30'), 'Mon, Oct 26 · 11:30');
  assert.equal(whenLabel('2026-10-26', null), 'Mon, Oct 26');
  // Chuỗi rỗng phải được coi như cả ngày, không in ra dấu chấm cụt.
  assert.equal(whenLabel('2026-10-26', ''), 'Mon, Oct 26');
});

test('giờ KHÔNG đổi số ngày còn lại - mốc vẫn tính theo ngày', () => {
  const e = ev({ date: '2026-10-15', time: '23:30' });
  assert.equal(dueMilestone(e, at('2026-10-14', '06:00')), 1);
  const allDay = ev({ date: '2026-10-15' });
  assert.equal(daysUntil(e.date, at('2026-10-14', '06:00')), daysUntil(allDay.date, at('2026-10-14', '06:00')));
});

test('cùng ngày: cả ngày đứng trước, rồi xếp theo giờ', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'evening', date: '2026-10-12', time: '19:00' }),
    ev({ id: 'allday', date: '2026-10-12', time: null }),
    ev({ id: 'morning', date: '2026-10-12', time: '06:30' }),
  ];
  const { upcoming } = splitEvents(list, now);
  assert.deepEqual(upcoming.map((e) => e.id), ['allday', 'morning', 'evening']);
});

test('giờ so sánh theo chuỗi được vì luôn hai chữ số', () => {
  const now = at('2026-10-10', '12:00');
  const list = [
    ev({ id: 'ten', date: '2026-10-12', time: '10:00' }),
    ev({ id: 'nine', date: '2026-10-12', time: '09:00' }),
  ];
  assert.deepEqual(splitEvents(list, now).upcoming.map((e) => e.id), ['nine', 'ten']);
});
