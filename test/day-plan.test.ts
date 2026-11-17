import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blockHours, blockWindow, cleanPlan, comparePlan, planDayOf, type PlanBlock } from '@/lib/day-plan';
import type { Activity, Category } from '@/types/logi';

import { at } from './_helpers.ts';

function act(category: Category, from: number, to: number | null): Activity {
  return {
    id: `${category}-${from}`,
    category,
    label: null,
    startAt: from,
    endAt: to,
    durationMin: null,
    logicalDate: '2026-11-17',
    logicalWeek: '',
    status: to === null ? 'active' : 'done',
    source: 'quick',
    confidence: null,
    rawText: null,
    createdAt: from,
    updatedAt: from,
  };
}

const learn: PlanBlock = { start: '19:00', end: '21:00', category: 'learn' };
const late: PlanBlock = { start: '23:00', end: '01:00', category: 'leisure' };

describe('day plan blocks', () => {
  it('counts hours across midnight', () => {
    assert.equal(blockHours(late), 2);
    const w = blockWindow('2026-11-17', late);
    assert.equal(w.start, at('2026-11-17', '23:00'));
    assert.equal(w.end, at('2026-11-18', '01:00'));
  });
  it('cleans bad blocks and sorts', () => {
    const p = cleanPlan({
      weekday: [learn, { start: '08:00', end: '07:00', category: 'work' }, { start: '06:00', end: '07:00', category: 'fitness' }, { start: '9', end: '10:00', category: 'work' }],
      saturday: 'x',
    });
    assert.deepEqual(p.weekday.map((b) => b.start), ['06:00', '19:00']);
    assert.deepEqual(p.saturday, []);
  });
  it('maps weekdays', () => {
    assert.equal(planDayOf(0), 'sunday');
    assert.equal(planDayOf(3), 'weekday');
    assert.equal(planDayOf(6), 'saturday');
  });
});

describe('comparePlan', () => {
  const date = '2026-11-17';
  const acts = [act('learn', at(date, '19:30'), at(date, '20:30')), act('learn', at(date, '08:00'), at(date, '09:00'))];

  it('gives plan and did per category', () => {
    const r = comparePlan([learn], acts, date, at('2026-11-18', '02:00'));
    assert.deepEqual(r.lines, ['plan 2h learn · did 2h']);
    assert.equal(r.blocks[0].did, 1);
    assert.equal(r.biggest?.block, learn);
  });
  it('counts a block later today only up to now', () => {
    const r = comparePlan([learn], [], date, at(date, '19:30'));
    assert.equal(r.blocks[0].planned, 0.5);
    assert.equal(r.biggest?.block, learn);
  });
  it('has no biggest gap when the plan was kept', () => {
    const r = comparePlan([learn], [act('learn', at(date, '19:00'), at(date, '21:00'))], date, at(date, '22:00'));
    assert.equal(r.biggest, null);
  });
});
