import assert from 'node:assert/strict';
import { test } from 'node:test';

import { h, msg, summary } from '@/lib/targets-view';

test('h rounds to one decimal and adds the unit', () => {
  assert.equal(h(12), '12h');
  assert.equal(h(12.34), '12.3h');
  assert.equal(h(0.05), '0.1h');
});

test('msg reads an Error or any thrown value', () => {
  assert.equal(msg(new Error('closed')), 'closed');
  assert.equal(msg('plain'), 'plain');
});

test('summary lists every category in CATEGORIES order with whole hours', () => {
  assert.equal(summary({ work: 40.4, learn: 20.6, fitness: 6, leisure: 22 } as never), 'L21 · W40 · F6 · Le22');
});
