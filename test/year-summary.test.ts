import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { monthName, yearChoices, yearRange, yearSummary } from '@/lib/year-summary';
import type { Activity, Category, DayLog } from '@/types/logi';

import { at } from './_helpers.ts';

function act(date: string, category: Category, hours: number): Activity {
  const startAt = at(date, '09:00');
  return {
    id: `${date}-${category}-${hours}`,
    category,
    label: null,
    startAt,
    endAt: startAt + hours * 3_600_000,
    durationMin: hours * 60,
    logicalDate: date,
    logicalWeek: '',
    status: 'done',
    source: 'quick',
    confidence: null,
    rawText: null,
    createdAt: startAt,
    updatedAt: startAt,
  };
}

const NOW = at('2026-03-15', '12:00');

describe('yearRange and yearChoices', () => {
  it('ends today for the current year', () => {
    assert.deepEqual(yearRange('2026', NOW), { from: '2026-01-01', to: '2026-03-15' });
    assert.deepEqual(yearRange('2025', NOW), { from: '2025-01-01', to: '2025-12-31' });
  });
  it('lists years from the first record, newest first', () => {
    assert.deepEqual(yearChoices('2024-06-01', NOW), ['2026', '2025', '2024']);
    assert.deepEqual(yearChoices(null, NOW), ['2026']);
  });
});

describe('yearSummary', () => {
  const acts = [
    act('2026-01-05', 'learn', 2),
    act('2026-01-06', 'work', 8),
    act('2026-02-10', 'learn', 1),
    act('2026-03-01', 'fitness', 1.5),
    act('2025-12-31', 'learn', 5),
  ];
  const logs: DayLog[] = [
    { date: '2026-01-05', bedtimeAt: at('2026-01-05', '23:00'), updatedAt: 0 },
    { date: '2026-01-06', bedtimeAt: at('2026-01-07', '00:00'), updatedAt: 0 },
    { date: '2026-01-07', bedtimeAt: at('2026-01-07', '23:30'), updatedAt: 0 },
  ];
  const s = yearSummary('2026', acts, logs, NOW);

  it('adds the year only', () => {
    assert.equal(s.totals.learn, 3);
    assert.equal(s.totals.work, 8);
  });
  it('gives hours per week', () => {
    // 74 days so far.
    assert.ok(Math.abs(s.weekly.work - 8 / (74 / 7)) < 1e-9);
  });
  it('picks best and worst month among logged ones', () => {
    assert.equal(s.best, '2026-01');
    assert.equal(s.worst, '2026-02');
    assert.equal(s.months.filter((m) => m.started).length, 3);
  });
  it('gives the median bedtime across midnight', () => {
    assert.equal(s.bedtime, '23:30');
    assert.equal(s.nights, 3);
  });
  it('has no best or worst with one month', () => {
    const one = yearSummary('2026', [act('2026-01-05', 'learn', 2)], [], NOW);
    assert.equal(one.best, null);
    assert.equal(one.bedtime, null);
  });
  it('names months', () => {
    assert.equal(monthName('2026-03'), 'Mar');
  });
});
