import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dragOffset, leavingItems, reducedMotion, sheetShouldClose } from '@/lib/motion';

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

test('sheetShouldClose: past a quarter of the height closes', () => {
  assert.equal(sheetShouldClose(120, 400, 0), true);
});

test('sheetShouldClose: a short slow drag springs back', () => {
  assert.equal(sheetShouldClose(40, 400, 0.1), false);
});

test('sheetShouldClose: a short fast flick closes', () => {
  assert.equal(sheetShouldClose(40, 400, 0.8), true);
});

test('dragOffset: dragging up is damped', () => {
  assert.equal(dragOffset(-50), -10);
});

test('dragOffset: dragging down follows the finger', () => {
  assert.equal(dragOffset(30), 30);
});
