import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateV3CutoverPolicyV1,
  publishV3CutoverPolicyV1,
  v3CutoverPolicyCanBypassHumanApproval,
  v3CutoverPolicyCanGrantModelAuthority,
} from '../dist/index.js';

test('canonical cutover policy is deterministic and uses one exact policy snapshot', () => {
  const first = evaluateV3CutoverPolicyV1();
  const second = evaluateV3CutoverPolicyV1();

  assert.equal(first.policy.policyHash, second.policy.policyHash);
  assert.equal(first.humanGateDecision.policyHash, first.systemPolicyDecision.policyHash);
  assert.equal(first.humanGateDecision.policyHash, first.modelDecision.policyHash);
  assert.equal(first.humanGateDecision.policyHash, publishV3CutoverPolicyV1().policyHash);
});

test('human gate remains HUMAN_REQUIRED while SYSTEM_POLICY independently ALLOWs', () => {
  const result = evaluateV3CutoverPolicyV1();

  assert.equal(result.humanGateDecision.effect, 'HUMAN_REQUIRED');
  assert.deepEqual(result.humanGateDecision.matchedRuleIds, ['require-human-v3-cutover']);

  assert.equal(result.systemPolicyDecision.effect, 'ALLOW');
  assert.deepEqual(result.systemPolicyDecision.matchedRuleIds, ['allow-system-v3-cutover-gate']);
});

test('model principal is denied for V3 cutover', () => {
  const result = evaluateV3CutoverPolicyV1();

  assert.equal(result.modelDecision.effect, 'DENY');
  assert.deepEqual(result.modelDecision.matchedRuleIds, ['deny-model-v3-cutover']);
  assert.equal(v3CutoverPolicyCanGrantModelAuthority(), false);
  assert.equal(v3CutoverPolicyCanBypassHumanApproval(), false);
});
