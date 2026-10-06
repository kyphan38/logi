import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isRealTap, pressDistance, type Press } from '@/lib/tap-guard';

const T = 1_000_000;

function press(over: Partial<Press> = {}): Press {
  return {
    downX: 100,
    downY: 200,
    downAt: T,
    upX: 100,
    upY: 200,
    upAt: T + 120,
    lastScrollAt: null,
    ...over,
  };
}

test('real tap: moves 4px, 200ms → fires', () => {
  const p = press({ upX: 103, upY: 202.6, upAt: T + 200 });
  assert.ok(pressDistance(p) < 5);
  assert.equal(isRealTap(p), true);
});

test('swipe: moves 25px → does not fire', () => {
  assert.equal(isRealTap(press({ upY: 225 })), false);
});

test('diagonal swipe is still a swipe: 12px across + 12px down', () => {
  assert.equal(isRealTap(press({ upX: 112, upY: 212 })), false);
});

test('long press: 700ms → does not fire', () => {
  assert.equal(isRealTap(press({ upAt: T + 700 })), false);
});

test('within 300ms after scroll → does not fire', () => {
  assert.equal(isRealTap(press({ lastScrollAt: T + 20 })), false);
});

test('over 300ms after scroll → fires as normal', () => {
  assert.equal(isRealTap(press({ upAt: T + 400, lastScrollAt: T })), true);
});

test('with no scroll yet the third layer blocks nothing', () => {
  assert.equal(isRealTap(press({ lastScrollAt: null })), true);
});
