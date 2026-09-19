import assert from 'node:assert/strict';
import test from 'node:test';

import { canFallbackAfterFailure, evaluateAuthority } from '../dist/index.js';

test('model cannot claim human approval authority', () => {
  assert.equal(evaluateAuthority('MODEL', 'HUMAN_APPROVER').allowed, false);
  assert.equal(evaluateAuthority('HUMAN', 'HUMAN_APPROVER').allowed, true);
});

test('semantic failure cannot trigger model shopping', () => {
  assert.equal(canFallbackAfterFailure('quota_exhausted'), true);
  assert.equal(canFallbackAfterFailure('semantic_failure'), false);
});
