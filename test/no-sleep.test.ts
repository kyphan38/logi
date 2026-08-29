import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

import { mapDocs } from '@/lib/activities';
import { PRESETS } from '@/lib/balance';
import { CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, HARD_FLOOR } from '@/types/logi';

// ---------------------------------------------------------------------------
// AMENDMENT-remove-sleep mục 4.2 + 12: sleep phải biến mất hoàn toàn,
// và record cũ còn sót trong cache offline phải bị lọc ở client.
// ---------------------------------------------------------------------------

test('CATEGORIES không chứa sleep', () => {
  assert.equal((CATEGORIES as readonly string[]).includes('sleep'), false);
  assert.equal(CATEGORIES.length, 4);
});

test('nhãn, màu, sàn cứng và mọi preset đều không còn khoá sleep', () => {
  assert.equal('sleep' in CATEGORY_LABEL, false);
  assert.equal('sleep' in CATEGORY_COLOR, false);
  assert.equal('sleep' in HARD_FLOOR, false);
  for (const id of ['normal', 'crunch', 'deep_learn', 'recovery'] as const) {
    assert.equal('sleep' in PRESETS[id].weekly, false, id);
  }
});

// --- Bộ lọc phòng thủ ở tầng đọc -------------------------------------------

/** Snapshot giả: `mapDocs` chỉ đụng tới `id` và `data()`. */
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

test('record sleep sót lại trong cache bị lọc khỏi kết quả đọc', () => {
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

test('không có record sleep thì không mất gì', () => {
  const out = mapDocs([snap('a', 'work'), snap('b', 'fitness'), snap('c', 'leisure')]);
  assert.equal(out.length, 3);
});

test('toàn bộ là sleep → trả về mảng rỗng, không ném lỗi', () => {
  assert.deepEqual(mapDocs([snap('a', 'sleep'), snap('b', 'sleep')]), []);
});
