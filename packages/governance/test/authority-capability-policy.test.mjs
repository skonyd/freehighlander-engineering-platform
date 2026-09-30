import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORITY_CAPABILITY_ACTIONS,
  authorityCapabilityPolicyCanSelfApprove,
  evaluateAuthorityCapabilityPolicyV1,
  publishAuthorityCapabilityPolicyV1,
} from '../dist/index.js';

test('critical capability policy is deterministic and fail-closed by principal', () => {
  const first = publishAuthorityCapabilityPolicyV1();
  const second = publishAuthorityCapabilityPolicyV1();

  assert.equal(first.policyHash, second.policyHash);

  for (const capability of Object.keys(AUTHORITY_CAPABILITY_ACTIONS)) {
    const evaluation = evaluateAuthorityCapabilityPolicyV1(capability);
    assert.equal(evaluation.humanDecision.effect, 'HUMAN_REQUIRED');
    assert.equal(evaluation.systemDecision.effect, 'ALLOW');
    assert.equal(evaluation.modelDecision.effect, 'DENY');
    assert.equal(evaluation.humanDecision.policyHash, evaluation.systemDecision.policyHash);
    assert.equal(evaluation.humanDecision.policyHash, evaluation.modelDecision.policyHash);
  }

  assert.equal(authorityCapabilityPolicyCanSelfApprove(), false);
});

test('unknown capability fails closed', () => {
  assert.throws(
    () => evaluateAuthorityCapabilityPolicyV1('UNKNOWN_CAPABILITY'),
    /unknown authority capability policy capability/,
  );
});
