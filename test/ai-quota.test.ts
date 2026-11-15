import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isQuotaError } from '@/lib/ai-quota';

test('Gemini 402 and 429 mean the AI credit is used up', () => {
  assert.equal(isQuotaError(new Error('Gemini 402: {"error":{"code":402}}')), true);
  assert.equal(isQuotaError(new Error('Gemini 429')), true);
  assert.equal(isQuotaError(new Error('Gemini 500: oops')), false);
  assert.equal(isQuotaError(new Error('Gemini returned no content')), false);
  assert.equal(isQuotaError('402'), false);
});
