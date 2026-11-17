import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as app from '@/lib/sleep-plan';
import * as fn from '../functions/src/sleep.ts';

// The function cannot import app code, so the push and the line on Now come
// from two copies. This keeps them equal.

describe('sleep plan', () => {
  it('cleans bad data to the default', () => {
    assert.deepEqual(app.cleanSleep(null), app.DEFAULT_SLEEP);
    assert.deepEqual(app.cleanSleep({ on: true, wake: '25:00', hours: 30 }), { on: true, wake: '06:30', hours: 12 });
    assert.equal(app.cleanSleep({ hours: 7.3 }).hours, 7.5);
  });

  it('gives the bedtime on the logical day', () => {
    assert.equal(app.bedtimeMinute({ on: true, wake: '06:30', hours: 7.5 }), 23 * 60);
    // 06:00 - 5.5h = 00:30, after midnight: still tonight.
    assert.equal(app.bedtimeMinute({ on: true, wake: '06:00', hours: 5.5 }), 24 * 60 + 30);
    assert.equal(app.clockOf(24 * 60 + 30), '00:30');
  });

  it('matches the function copy', () => {
    for (const wake of ['04:00', '05:15', '06:30', '09:45', '12:00']) {
      for (let hours = 4; hours <= 12; hours += 0.5) {
        const plan = { on: true, wake, hours };
        assert.equal(app.bedtimeMinute(plan), fn.bedtimeMinute(plan), `${wake} ${hours}`);
        assert.equal(app.clockOf(app.bedtimeMinute(plan)), fn.clockOf(fn.bedtimeMinute(plan)));
      }
    }
    for (const raw of [null, {}, { on: true, wake: '7:00', hours: '8' }, { on: 1, wake: '07:00', hours: 3 }]) {
      assert.deepEqual(app.cleanSleep(raw), fn.cleanSleep(raw));
    }
  });
});
