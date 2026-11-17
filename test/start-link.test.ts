import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStartLink, startLinks } from '@/lib/start-link';

describe('parseStartLink', () => {
  it('reads a category', () => {
    assert.deepEqual(parseStartLink('?start=learn'), { category: 'learn', label: null });
  });
  it('ignores case and spaces', () => {
    assert.deepEqual(parseStartLink('?start=%20Fitness%20'), { category: 'fitness', label: null });
  });
  it('reads a label', () => {
    assert.deepEqual(parseStartLink('?start=fitness&label=gym'), { category: 'fitness', label: 'gym' });
  });
  it('cuts a long label', () => {
    assert.equal(parseStartLink(`?start=work&label=${'a'.repeat(200)}`)?.label?.length, 80);
  });
  it('returns null for an unknown or missing category', () => {
    assert.equal(parseStartLink('?start=sleep'), null);
    assert.equal(parseStartLink(''), null);
    assert.equal(parseStartLink('?label=gym'), null);
  });
});

describe('startLinks', () => {
  it('gives one link per category', () => {
    const links = startLinks('https://x.app');
    assert.equal(links.length, 4);
    assert.equal(links[0].url, 'https://x.app/now?start=learn');
  });
});
