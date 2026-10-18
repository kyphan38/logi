import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBlock, readBlocks, MAX_BLOCKS } from '@/lib/mora-ingest';
import { logicalDateInZone, deriveInZone } from '@/lib/activity-rules';
import { logicalWeek } from '@/lib/balance';

// 2026-10-18 02:30 in Vietnam = 2026-10-17 19:30 UTC.
const VN_0230 = Date.UTC(2026, 9, 17, 19, 30);
const NOW = VN_0230 + 6 * 3600_000;

test('logicalDateInZone cuts at 04:00 in the given zone, not the server clock', () => {
  assert.equal(logicalDateInZone(VN_0230, 'Asia/Ho_Chi_Minh'), '2026-10-17');
  assert.equal(logicalDateInZone(VN_0230 + 2 * 3600_000, 'Asia/Ho_Chi_Minh'), '2026-10-18');
  assert.equal(logicalDateInZone(VN_0230, 'UTC'), '2026-10-17');
});

test('deriveInZone matches derive for a device in the same zone', () => {
  // Tests run with TZ=Asia/Ho_Chi_Minh, so logicalWeek uses the same clock.
  const d = deriveInZone(VN_0230, VN_0230 + 25 * 60_000, 'Asia/Ho_Chi_Minh');
  assert.deepEqual(d, { logicalDate: '2026-10-17', logicalWeek: logicalWeek(VN_0230), durationMin: 25 });
});

test('a good block becomes a finished mora record with a stable id', () => {
  const c = checkBlock({ id: 'abc_1', kind: 'work', label: ' Ship it ', startAt: VN_0230, endAt: VN_0230 + 1500_000 }, NOW);
  assert.equal(c.ok, true);
  if (!c.ok) return;
  assert.equal(c.record.docId, 'mora_abc_1');
  assert.equal(c.record.data.category, 'work');
  assert.equal(c.record.data.label, 'Ship it');
  assert.equal(c.record.data.status, 'done');
  assert.equal(c.record.data.source, 'mora');
  assert.equal(c.record.data.durationMin, 25);
});

test('missing kind means learn; empty label is null', () => {
  const c = checkBlock({ id: 'x', label: '  ', startAt: VN_0230, endAt: VN_0230 + 60_000 }, NOW);
  assert.equal(c.ok && c.record.data.category, 'learn');
  assert.equal(c.ok && c.record.data.label, null);
});

test('bad blocks are rejected with a reason', () => {
  const base = { id: 'x', kind: 'learn', label: 'a', startAt: VN_0230, endAt: VN_0230 + 60_000 };
  const reason = (b: unknown) => {
    const c = checkBlock(b, NOW);
    return c.ok ? 'ok' : c.reason;
  };
  assert.equal(reason({ ...base, id: 'has space' }), 'bad-id');
  assert.equal(reason({ ...base, kind: 'leisure' }), 'bad-category');
  assert.equal(reason({ ...base, endAt: VN_0230 }), 'end-before-start');
  assert.equal(reason({ ...base, startAt: NOW - 8 * 86400_000, endAt: NOW - 8 * 86400_000 + 60_000 }), 'too-old');
  assert.equal(reason({ ...base, startAt: 'soon' }), 'bad-times');
});

test('readBlocks guards the body shape and size', () => {
  assert.throws(() => readBlocks({}));
  assert.throws(() => readBlocks({ blocks: Array(MAX_BLOCKS + 1).fill({}) }));
  assert.equal(readBlocks({ blocks: [] }).length, 0);
});
