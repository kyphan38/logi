// ---------------------------------------------------------------------------
// Stage 8 - bedtime.
//
// The trap here is 00:15. On the clock it is the SMALLEST number of the day,
// yet it is the LATEST bedtime. The continuous scale (22:00 → 22.0, 00:15 →
// 24.25) exists only so averages and min/max do not flip.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bedtimeScale, bedtimeStats, formatBedtime, formatScale, median } from '@/lib/bedtime';

import { at } from './_helpers.ts';

describe('bedtimeScale', () => {
  it('the evening before keeps its clock time', () => {
    assert.equal(bedtimeScale(at('2026-08-26', '22:00')), 22);
    assert.equal(bedtimeScale(at('2026-08-26', '23:30')), 23.5);
  });

  it('after midnight adds 24 - still the night before', () => {
    assert.equal(bedtimeScale(at('2026-08-27', '00:15')), 24.25);
    assert.equal(bedtimeScale(at('2026-08-27', '01:30')), 25.5);
  });

  it('00:15 > 22:00 on this scale (the opposite of the clock)', () => {
    const late = bedtimeScale(at('2026-08-27', '00:15'));
    const early = bedtimeScale(at('2026-08-26', '22:00'));
    assert.ok(late > early, 'a later bedtime must give a bigger number');
  });

  it('the 04:00 cut: 03:59 is still the night before, 04:00 is a new day', () => {
    assert.equal(bedtimeScale(at('2026-08-27', '03:59')), 27 + 59 / 60);
    assert.equal(bedtimeScale(at('2026-08-27', '04:00')), 4);
  });
});

describe('formatScale', () => {
  it('back to a 24h clock time', () => {
    assert.equal(formatScale(22), '22:00');
    assert.equal(formatScale(24.25), '00:15');
    assert.equal(formatScale(25.5), '01:30');
  });

  it('23.999 must give 00:00, not 23:60', () => {
    assert.equal(formatScale(23.999), '00:00');
  });

  it('formatBedtime reads straight from epoch', () => {
    assert.equal(formatBedtime(at('2026-08-27', '00:15')), '00:15');
  });
});

describe('median', () => {
  it('odd count → the middle item', () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it('even count → the average of the two middle items', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it('empty → null', () => {
    assert.equal(median([]), null);
  });

  it('does not mutate the array passed in', () => {
    const xs = [3, 1, 2];
    median(xs);
    assert.deepEqual(xs, [3, 1, 2]);
  });
});

describe('bedtimeStats', () => {
  it('median on the continuous scale, not on clock time', () => {
    const s = bedtimeStats([
      at('2026-08-24', '23:00'),
      at('2026-08-26', '00:30'), // 24.5 - the latest
      at('2026-08-25', '22:00'), // 22.0 - the earliest
    ]);
    assert.ok(s);
    assert.equal(s.median, 23);
    assert.equal(s.min, 22);
    assert.equal(s.max, 24.5);
    assert.equal(s.n, 3);
    assert.equal(formatScale(s.max), '00:30');
  });

  it('no logged nights → null, not 0', () => {
    assert.equal(bedtimeStats([]), null);
  });

  it('n is the number of nights really logged - AI insight relies on it', () => {
    const s = bedtimeStats([at('2026-08-24', '23:00'), at('2026-08-25', '23:30')]);
    assert.ok(s);
    assert.equal(s.n, 2);
    assert.equal(s.median, 23.25);
  });
});
