import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

import { mapDocs } from '@/lib/activities';
import { PRESETS } from '@/lib/balance';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, HARD_FLOOR } from '@/types/logi';

// ---------------------------------------------------------------------------
// Sleep must be gone entirely, and old records left in the offline cache
// must be filtered on the client.
// ---------------------------------------------------------------------------

test('CATEGORIES has no sleep', () => {
  assert.equal((CATEGORIES as readonly string[]).includes('sleep'), false);
  assert.equal(CATEGORIES.length, 4);
});

test('labels, colors, hard floors and every preset have no sleep key', () => {
  assert.equal('sleep' in CATEGORY_LABEL, false);
  assert.equal('sleep' in CATEGORY_COLOR, false);
  assert.equal('sleep' in HARD_FLOOR, false);
  for (const id of ['normal', 'crunch', 'deep_learn', 'recovery'] as const) {
    assert.equal('sleep' in PRESETS[id].weekly, false, id);
  }
});

// --- Defensive filter on read ----------------------------------------------

/** Fake snapshot: `mapDocs` only touches `id` and `data()`. */
function snap(id: string, category: string): QueryDocumentSnapshot {
  return {
    id,
    data: () => ({
      category,
      startAt: 1_700_000_000_000,
      endAt: 1_700_003_600_000,
      logicalDate: '2026-08-24',
      logicalWeek: '2026-W35',
      status: 'done',
    }),
  } as unknown as QueryDocumentSnapshot;
}

test('leftover sleep records in the cache are filtered from reads', () => {
  const out = mapDocs([
    snap('a', 'work'),
    snap('b', 'sleep'),
    snap('c', 'learn'),
    snap('d', 'sleep'),
  ]);

  assert.deepEqual(
    out.map((a) => a.id),
    ['a', 'c']
  );
  assert.equal(
    out.some((a) => (a.category as string) === 'sleep'),
    false
  );
});

test('with no sleep records nothing is lost', () => {
  const out = mapDocs([snap('a', 'work'), snap('b', 'fitness'), snap('c', 'leisure')]);
  assert.equal(out.length, 3);
});

test('all sleep → returns an empty array, no throw', () => {
  assert.deepEqual(mapDocs([snap('a', 'sleep'), snap('b', 'sleep')]), []);
});
