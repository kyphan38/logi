import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costUsd, formatUsd, monthKey, monthLabel, pricePerMillion, splitMonths } from '@/lib/ai-cost';

const NOV = Date.UTC(2026, 10, 20);

test('ai-cost: flash, argon, hydrogen and embedding prices', () => {
  assert.deepEqual(pricePerMillion('gemini-3.8-flash', NOV), { input: 0.75, output: 3.75 });
  assert.deepEqual(pricePerMillion('gemini-3.8-flash', Date.UTC(2027, 0, 1)), { input: 1.5, output: 7.5 });
  assert.deepEqual(pricePerMillion('gemini-4-argon', NOV), { input: 2, output: 10 });
  assert.deepEqual(pricePerMillion('gemini-4-argon', Date.UTC(2026, 11, 1)), { input: 4, output: 20 });
  assert.deepEqual(pricePerMillion('gemini-4-hydrogen', NOV), { input: 1.5, output: 7.5 });
  assert.deepEqual(pricePerMillion('gemini-embedding-2', NOV), { input: 0.15, output: 0 });
});

test('ai-cost: thinking tokens bill as output', () => {
  const usd = costUsd('gemini-3.8-flash', { promptTokenCount: 1_000_000, candidatesTokenCount: 500_000, thoughtsTokenCount: 500_000 }, NOV);
  assert.equal(usd, 0.75 + 3.75);
  assert.equal(costUsd('gemini-3.8-flash', undefined, NOV), 0);
});

test('ai-cost: month is in Vietnam time', () => {
  assert.equal(monthKey(Date.UTC(2026, 10, 30, 16, 59)), '2026-11');
  assert.equal(monthKey(Date.UTC(2026, 10, 30, 17, 0)), '2026-12');
  assert.equal(monthLabel('2026-11'), 'Nov 2026');
});

test('ai-cost: format and split months', () => {
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(0.004), '< $0.01');
  assert.equal(formatUsd(1.236), '$1.24');
  const s = splitMonths(
    [
      { month: '2026-09', usd: 1 },
      { month: '2026-11', usd: 0.5 },
      { month: '2026-10', usd: 2 },
      { month: 'bad', usd: 3 },
    ],
    NOV,
  );
  assert.equal(s.current, 0.5);
  assert.deepEqual(s.past.map((r) => r.month), ['2026-10', '2026-09']);
  assert.equal(splitMonths([], NOV).current, 0);
});
