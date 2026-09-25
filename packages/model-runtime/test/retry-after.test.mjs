import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProviderRetryAfterMs, retryAfterParserCanGrantAuthority } from '../dist/index.js';

test('retry-after parser accepts delta-seconds deterministically', () => {
  assert.equal(parseProviderRetryAfterMs('2', 0), 2_000);
  assert.equal(parseProviderRetryAfterMs(' 1.5 ', 0), 1_500);
  assert.equal(parseProviderRetryAfterMs('0', 0), 0);
});

test('retry-after parser accepts HTTP-date using the supplied observation clock', () => {
  const now = Date.parse('2026-09-25T18:00:00.000Z');
  assert.equal(parseProviderRetryAfterMs('Fri, 25 Sep 2026 18:02:00 GMT', now), 120_000);
  assert.equal(parseProviderRetryAfterMs('Fri, 25 Sep 2026 17:59:00 GMT', now), 0);
});

test('missing malformed and negative retry-after hints are ignored safely', () => {
  assert.equal(parseProviderRetryAfterMs(null, 0), undefined);
  assert.equal(parseProviderRetryAfterMs('   ', 0), undefined);
  assert.equal(parseProviderRetryAfterMs('-1', 0), undefined);
  assert.equal(parseProviderRetryAfterMs('not-a-date', 0), undefined);
  assert.throws(() => parseProviderRetryAfterMs('1', Number.NaN), /nowMs must be finite/);
});

test('retry-after parsing remains authority-neutral', () => {
  assert.equal(retryAfterParserCanGrantAuthority(), false);
});
