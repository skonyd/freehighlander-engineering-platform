import assert from 'node:assert/strict';
import test from 'node:test';

import { isAvailabilityFailure } from '../dist/index.js';

test('fallback eligibility is limited to availability failures', () => {
  assert.equal(isAvailabilityFailure('quota_exhausted'), true);
  assert.equal(isAvailabilityFailure('provider_unavailable'), true);
  assert.equal(isAvailabilityFailure('semantic_failure'), false);
  assert.equal(isAvailabilityFailure('malformed_output'), false);
});
