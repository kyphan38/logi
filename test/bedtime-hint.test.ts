import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bedtimeHint } from '@/lib/bedtime-hint';

import { at } from './_helpers.ts';

const plan = { on: true, wake: '06:30', hours: 7.5 };

describe('bedtimeHint', () => {
  it('shows from 30 minutes before', () => {
    assert.equal(bedtimeHint(plan, '2026-11-17', at('2026-11-17', '22:29'), null), null);
    assert.equal(bedtimeHint(plan, '2026-11-17', at('2026-11-17', '22:30'), null), 'Bed at 23:00');
    assert.equal(bedtimeHint(plan, '2026-11-17', at('2026-11-18', '01:00'), null), 'Bed at 23:00');
  });
  it('works for a bedtime after midnight', () => {
    const late = { on: true, wake: '07:00', hours: 6.5 };
    assert.equal(bedtimeHint(late, '2026-11-17', at('2026-11-17', '23:59'), null), null);
    assert.equal(bedtimeHint(late, '2026-11-17', at('2026-11-18', '00:00'), null), 'Bed at 00:30');
  });
  it('is quiet when off or logged', () => {
    assert.equal(bedtimeHint({ ...plan, on: false }, '2026-11-17', at('2026-11-17', '23:00'), null), null);
    assert.equal(bedtimeHint(plan, '2026-11-17', at('2026-11-17', '23:00'), 1), null);
  });
});
