import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Digest } from '@/lib/digest';
import {
  MAX_OBSERVATIONS,
  NOTHING_NOTABLE,
  hasBannedWord,
  lookupMetric,
  sanitizeInsight,
} from '@/lib/insight-sanitize';

// Digest giả, đủ số để đối chiếu. Giống hình dạng thật của `buildDigest`.
const DIGEST: Digest = {
  period: { label: 'Aug 24 – Aug 30', days: 7, coveragePct: 72 },
  totals: {
    learn: { hours: 12.5, targetHours: 31, deviationPct: -60, sessions: 8 },
    work: { hours: 51.2, targetHours: 43, sessions: 9 },
  },
  sleep: { medianBedtime: '23:40', bedtimeSpreadMin: 80, nightsAfter23: 4, nights: 6 },
  links: { learnHoursOnDaysWorkOver9h: { value: 0.4, n: 3 } },
};

const obs = (body: string, extra: Record<string, unknown> = {}) => ({
  title: 'Sleep drifted later',
  body,
  metric: 'sleep.medianBedtime',
  severity: 'notable',
  ...extra,
});

const run = (raw: unknown) => sanitizeInsight(raw, DIGEST);

// ------------------------------------------------------------
// Đối chiếu số
// ------------------------------------------------------------

test('số có trong digest thì giữ nguyên nhận xét', () => {
  const r = run({ observations: [obs('Median bedtime 23:40, spread 80 minutes across 6 nights.')] });
  assert.equal(r.observations.length, 1);
  assert.equal(r.note, null);
});

test('số KHÔNG có trong digest → bỏ cả nhận xét', () => {
  const r = run({ observations: [obs('Median bedtime 23:40, and you slept 5.2 hours.')] });
  assert.equal(r.observations.length, 0);
  assert.equal(r.note, NOTHING_NOTABLE);
});

test('giờ đồng hồ bịa cũng bị bắt', () => {
  const r = run({ observations: [obs('Median bedtime 01:15 this week.')] });
  assert.equal(r.observations.length, 0);
});

test('phần trăm viết theo cách khác vẫn khớp', () => {
  const r = run({ observations: [obs('Coverage was 72% for this period.')] });
  assert.equal(r.observations.length, 1);
});

test('"1h20m" khớp với bedtimeSpreadMin 80 phút', () => {
  const r = run({ observations: [obs('Bedtime moved 1h20m later.')] });
  assert.equal(r.observations.length, 1);
});

test('mốc giờ trong lịch sinh hoạt được phép nhắc lại', () => {
  const r = run({ observations: [obs('Four nights ran past 23:00 with bedtime at 23:40.')] });
  assert.equal(r.observations.length, 1);
});

test('câu không có số nào thì không có gì để đối chiếu', () => {
  const r = run({ observations: [obs('Bedtime is drifting later across the period.')] });
  assert.equal(r.observations.length, 1);
});

// ------------------------------------------------------------
// Từ cấm
// ------------------------------------------------------------

test('câu chứa "because" bị bỏ', () => {
  const r = run({ observations: [obs('Learn fell to 12.5 hours because work took the evenings.')] });
  assert.equal(r.observations.length, 0);
});

test('các cách nói nhân quả khác cũng bị bắt', () => {
  for (const w of ['due to', 'led to', 'resulted in', 'caused']) {
    assert.equal(hasBannedWord(`Sleep dropped ${w} something.`), true, w);
  }
  assert.equal(hasBannedWord('Learn 12.5 hours alongside 51.2 hours of work.'), false);
});

test('câu chứa "burnout" bị bỏ', () => {
  const r = run({ observations: [obs('Work at 51.2 hours is a burnout risk.')] });
  assert.equal(r.observations.length, 0);
});

test('từ y tế và từ phán xét đều bị chặn', () => {
  for (const w of ['insomnia', 'depression', 'disorder', 'too much', 'unhealthy', 'you should']) {
    assert.equal(hasBannedWord(`This looks like ${w}.`), true, w);
  }
});

test('tiêu đề bẩn cũng làm rớt nhận xét', () => {
  const r = run({ observations: [obs('Sleep is fine.', { title: 'Too much work' })] });
  assert.equal(r.observations.length, 0);
});

// ------------------------------------------------------------
// Hình dạng kết quả
// ------------------------------------------------------------

test('6 nhận xét → cắt còn 4', () => {
  const list = Array.from({ length: 6 }, () => obs('Nights after 23:00 were 4 in total.'));
  const r = run({ observations: list });
  assert.equal(r.observations.length, MAX_OBSERVATIONS);
});

test('severity lạ thì hạ về info; metric không tra được thì bỏ nhãn', () => {
  const r = run({
    observations: [obs('Nights after 23:00 were 4.', { severity: 'critical', metric: 'made.up' })],
  });
  assert.equal(r.observations[0].severity, 'info');
  assert.equal(r.observations[0].metric, '');
});

test('bỏ hết thì trả câu mặc định, không trả mảng rỗng câm lặng', () => {
  const r = run({ observations: [obs('You slept 3.7 hours because of work.')] });
  assert.deepEqual(r.observations, []);
  assert.equal(r.note, NOTHING_NOTABLE);
});

test('rác hoàn toàn cũng không làm sập', () => {
  assert.equal(run(null).note, NOTHING_NOTABLE);
  assert.equal(run({ observations: 'nope' }).observations.length, 0);
  assert.equal(run({ observations: [{ title: '' }, 42, null] }).observations.length, 0);
});

// ------------------------------------------------------------
// Gợi ý & lời khen
// ------------------------------------------------------------

test('gợi ý được nhắc giờ trong lịch sinh hoạt, nhưng preset phải hợp lệ', () => {
  const r = run({
    observations: [obs('Nights after 23:00 were 4.')],
    suggestion: { text: 'Protect the 20:30 study block on Tue and Thu.', preset: 'recovery' },
  });
  assert.equal(r.suggestion!.preset, 'recovery');

  const bad = run({
    observations: [obs('Nights after 23:00 were 4.')],
    suggestion: { text: 'Try a lighter week.', preset: 'super_mode' },
  });
  assert.equal(bad.suggestion!.preset, null);
});

test('gợi ý mang tính dạy đời thì bỏ luôn', () => {
  const r = run({
    observations: [obs('Nights after 23:00 were 4.')],
    suggestion: { text: 'You should sleep more, this is unhealthy.', preset: 'recovery' },
  });
  assert.equal(r.suggestion, null);
});

test('lời khen vẫn bị soi số như nhận xét', () => {
  const ok = run({ observations: [obs('Nights after 23:00 were 4.')], positive: 'Six nights logged.' });
  assert.equal(ok.positive, 'Six nights logged.');

  const bad = run({
    observations: [obs('Nights after 23:00 were 4.')],
    positive: 'You hit 14 fitness sessions.',
  });
  assert.equal(bad.positive, null);
});

// ------------------------------------------------------------
// Tra ngược chỉ số
// ------------------------------------------------------------

test('tra chỉ số theo đường dẫn đầy đủ hoặc theo tên lá', () => {
  assert.equal(lookupMetric(DIGEST, 'sleep.medianBedtime')!.value, '23:40');
  assert.equal(lookupMetric(DIGEST, 'bedtimeSpreadMin')!.value, 80);
  assert.equal(lookupMetric(DIGEST, 'totals.learn.hours')!.value, 12.5);
  assert.equal(lookupMetric(DIGEST, 'nope'), null);
  assert.equal(lookupMetric(DIGEST, ''), null);
});
