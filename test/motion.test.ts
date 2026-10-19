import assert from 'node:assert/strict';
import { test } from 'node:test';

import { leavingItems, reducedMotion } from '@/lib/motion';

const a = { id: 'a' };
const b = { id: 'b' };
const c = { id: 'c' };

test('reducedMotion: true in Node (no matchMedia)', () => {
  assert.equal(reducedMotion(), true);
});

test('leavingItems: a removed item is leaving', () => {
  assert.deepEqual(leavingItems([a, b, c], [a, c]), [b]);
});

test('leavingItems: same list, nothing leaves', () => {
  assert.deepEqual(leavingItems([a, b], [a, b]), []);
});

test('leavingItems: a new item is not leaving', () => {
  assert.deepEqual(leavingItems([a], [a, b]), []);
});

test('leavingItems: works with number ids', () => {
  assert.deepEqual(leavingItems([{ id: 1 }, { id: 2 }], [{ id: 2 }]), [{ id: 1 }]);
});
