import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDigest,
  canAnalyze,
  digestHash,
  estimateTokens,
  extremeNote,
  hhmm,
  TOKEN_BUDGET,
} from '@/lib/digest';
import { expectedForRange } from '@/lib/range-target';
import { addDays } from '@/lib/timeline';
import type { Range } from '@/lib/range';
import { hasBannedWord } from '@/lib/insight-sanitize';
import { computeSignals } from '@/lib/signals';
import { PRESETS, type Activity, type Category } from '@/types/logi';
import { act, at } from './_helpers.ts';

const NOW = at('2026-08-31', '12:00');
const WEEK: Range = { from: '2026-08-24', to: '2026-08-30', kind: 'custom', isPartial: false };

function targetsFor(weeks: string[]): Map<string, Record<Category, number>> {
  return new Map(weeks.map((w) => [w, PRESETS.normal.weekly]));
}

const WEEK_TARGETS = targetsFor(['2026-W32', '2026-W33', '2026-W34', '2026-W35']);

function sig(activities: Activity[], range: Range = WEEK, now = NOW) {
  return computeSignals(
    activities,
    range,
    expectedForRange(range, WEEK_TARGETS, now),
    WEEK_TARGETS,
    undefined,
    now
  );
}

function s(category: Category, date: string, from: string, to: string, endDate = date): Activity {
  return act({
    id: `${category}-${date}-${from}`,
    category,
    startAt: at(date, from),
    endAt: at(endDate, to),
  });
}

/** Một tháng dữ liệu dày: 5 session mỗi ngày, 31 ngày. */
function month(): { acts: Activity[]; range: Range } {
  const acts: Activity[] = [];
  for (let i = 0; i < 31; i++) {
    const d = addDays('2026-07-25', i);
    acts.push(
      s('sleep', d, '22:30', '05:00', addDays(d, 1)),
      s('learn', d, '05:00', '06:30'),
      s('work', d, '08:00', '17:30'),
      s('fitness', d, '18:00', '19:00'),
      s('leisure', d, '20:00', '21:30')
    );
  }
  return {
    acts,
    range: { from: '2026-07-25', to: '2026-08-24', kind: 'custom', isPartial: false },
  };
}

// ------------------------------------------------------------
// Hình dạng digest
// ------------------------------------------------------------

test('digest có đủ 5 category, mỗi cái ít nhất 3 chỉ số', () => {
  const d = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  const totals = d.totals as Record<string, Record<string, unknown>>;
  for (const c of ['learn', 'work', 'fitness', 'sleep', 'leisure']) {
    assert.ok(totals[c], `thiếu ${c}`);
    assert.ok(Object.keys(totals[c]).length >= 3, `${c} quá mỏng`);
  }
  const period = d.period as Record<string, unknown>;
  assert.equal(period.days, 7);
  assert.equal(period.preset, 'normal');
  assert.equal(typeof period.label, 'string');
});

test('chỉ số null bị loại khỏi digest', () => {
  const d = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  // Không có buổi tập nào → không có trung vị, không có khoảng cách.
  const fitness = d.fitness as Record<string, unknown>;
  assert.equal('medianSessionMin' in fitness, false);
  assert.equal('longestGapDays' in fitness, false);
  assert.equal('daysSinceLast' in fitness, false);
  // Không có đêm nào → không có giờ đi ngủ.
  const sleep = d.sleep as Record<string, unknown>;
  assert.equal('medianBedtime' in sleep, false);
  // Không có kỳ trước → không có cột so sánh.
  const totals = d.totals as Record<string, Record<string, unknown>>;
  assert.equal('vsPreviousHours' in totals.work, false);
});

test('chỉ số liên hệ dưới 3 mẫu không được đưa vào digest', () => {
  const two = buildDigest(
    sig([
      s('work', '2026-08-24', '08:00', '18:30'),
      s('work', '2026-08-25', '08:00', '18:30'),
      s('learn', '2026-08-24', '20:00', '21:00'),
    ])
  );
  const links = (two.links ?? {}) as Record<string, unknown>;
  assert.equal('learnHoursOnDaysWorkOver9h' in links, false);

  const three = buildDigest(
    sig([
      s('work', '2026-08-24', '08:00', '18:30'),
      s('work', '2026-08-25', '08:00', '18:30'),
      s('work', '2026-08-26', '08:00', '18:30'),
      s('learn', '2026-08-24', '20:00', '21:00'),
    ])
  );
  const link = (three.links as Record<string, { value: number; n: number }>)
    .learnHoursOnDaysWorkOver9h;
  assert.equal(link.n, 3);
  assert.ok(Math.abs(link.value - 0.3) < 0.05);
});

test('giờ được viết dạng HH:MM, không phải số phút thô', () => {
  const d = buildDigest(
    sig([
      s('sleep', '2026-08-24', '23:20', '05:00', '2026-08-25'),
      s('sleep', '2026-08-25', '23:20', '05:00', '2026-08-26'),
    ])
  );
  const sleep = d.sleep as Record<string, unknown>;
  assert.equal(sleep.medianBedtime, '23:20');
  assert.equal(sleep.medianWakeTime, '05:00');
  assert.equal(hhmm(1470), '00:30');
});

test('digest một tháng vẫn dưới ngân sách token', () => {
  const { acts, range } = month();
  const d = buildDigest(sig(acts, range));
  const tokens = estimateTokens(d);
  assert.ok(tokens < TOKEN_BUDGET, `digest ${tokens} token, quá ${TOKEN_BUDGET}`);
  // Và không được chứa record thô: không id, không nhãn, không epoch.
  const text = JSON.stringify(d);
  assert.equal(/"id"|rawText|"startAt"/.test(text), false);
  assert.equal(/17[0-9]{11}/.test(text), false);
});

test('cùng dữ liệu ra cùng hash, đổi một record là hash đổi', () => {
  const a = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  const b = buildDigest(sig([s('work', '2026-08-24', '08:00', '17:00')]));
  const c = buildDigest(sig([s('work', '2026-08-24', '08:00', '18:00')]));
  assert.equal(digestHash(a), digestHash(b));
  assert.notEqual(digestHash(a), digestHash(c));
  assert.equal(digestHash(a).length, 8);
});

// ------------------------------------------------------------
// Cổng chặn
// ------------------------------------------------------------

test('không có record nào → chặn, nói rõ là chưa log gì', () => {
  const g = canAnalyze(sig([]));
  assert.equal(g.ok, false);
  assert.match(g.reason!, /Nothing logged/);
});

test('khoảng dưới 3 ngày → chặn', () => {
  const two: Range = { from: '2026-08-24', to: '2026-08-25', kind: 'custom', isPartial: false };
  const g = canAnalyze(sig([s('work', '2026-08-24', '08:00', '17:00')], two));
  assert.equal(g.ok, false);
  assert.match(g.reason!, /at least 3 days/);
});

test('coverage thấp → chặn và nêu đúng phần trăm', () => {
  // 7 ngày, chỉ log 4h mỗi ngày → coverage ~17%.
  const acts = ['24', '25', '26', '27', '28', '29', '30'].map((d) =>
    s('work', `2026-08-${d}`, '08:00', '12:00')
  );
  const g = canAnalyze(sig(acts));
  assert.equal(g.ok, false);
  assert.match(g.reason!, /^Only \d+% of this period is logged\.$/);
  assert.match(g.hint!, /Log more/);
});

test('dữ liệu đầy đủ → cho chạy', () => {
  const { acts, range } = month();
  const g = canAnalyze(sig(acts, range));
  assert.equal(g.ok, true);
  assert.equal(g.reason, undefined);
});

// ------------------------------------------------------------
// Dữ liệu cực đoan (Task 8)
// ------------------------------------------------------------

const plain = (over: Record<string, unknown> = {}) => ({
  period: { days: 7 },
  totals: { sleep: { hours: 40, targetHours: 46.5 }, work: { hours: 43, targetHours: 43 } },
  sleep: { medianNightHours: 6.5 },
  ...over,
});

test('tuần bình thường thì im lặng - mặc định là không nói gì', () => {
  assert.equal(extremeNote(plain()), null);
});

test('ngủ trung vị dưới 5h → một dòng trung tính, mốc là target của chính mình', () => {
  const note = extremeNote(plain({ sleep: { medianNightHours: 4.4 } }))!;
  assert.match(note, /4\.4h/);
  assert.match(note, /your own floor of 47h/);
  assert.match(note, /Worth a rest week/);
});

test('dòng cực đoan không chứa từ y tế hay phán xét', () => {
  const note = extremeNote(plain({ sleep: { medianNightHours: 3 } }))!;
  assert.equal(hasBannedWord(note), false);
});

test('work trên 70h/tuần → nói, nhưng vẫn nêu số bình thường', () => {
  const note = extremeNote(
    plain({ totals: { sleep: { hours: 40, targetHours: 46.5 }, work: { hours: 78, targetHours: 43 } } })
  )!;
  assert.match(note, /78h a week/);
  assert.match(note, /your own ceiling of 43h/);
});

test('khoảng dài quy đổi work về một tuần trước khi so', () => {
  // 30 ngày, 200h work = 46.7h/tuần → chưa tới ngưỡng.
  const note = extremeNote(
    plain({
      period: { days: 30 },
      totals: { sleep: { hours: 200, targetHours: 199 }, work: { hours: 200, targetHours: 184 } },
    })
  );
  assert.equal(note, null);
});

test('thiếu chỉ số ngủ thì không đoán bừa', () => {
  assert.equal(extremeNote({ period: { days: 7 }, totals: {} }), null);
});
