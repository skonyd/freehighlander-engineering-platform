import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHumanApprovalRequest,
  evaluatePolicy,
  modelCanActAsHumanApprover,
  policyConfigurationCanSelfApprove,
  publishPolicy,
  recordHumanDecision,
  verifyHumanDecisionBinding,
} from '../dist/index.js';

const policy = publishPolicy({
  id: 'default-governance',
  version: '1.0.0',
  rules: [
    {
      id: 'allow-normal-read',
      actions: ['read'],
      riskTiers: ['NORMAL'],
      principalKinds: ['MODEL', 'HUMAN', 'SYSTEM'],
      effect: 'ALLOW',
    },
    {
      id: 'human-high-write',
      actions: ['write'],
      riskTiers: ['HIGH'],
      effect: 'HUMAN_REQUIRED',
    },
    {
      id: 'deny-secret-write',
      actions: ['write'],
      dataClassifications: ['SECRET'],
      effect: 'DENY',
    },
  ],
});

test('policy publication is deterministic and rule-order independent', () => {
  const second = publishPolicy({
    ...policy.definition,
    rules: [...policy.definition.rules].reverse(),
  });

  assert.equal(policy.policyHash, second.policyHash);
});

test('policy defaults to DENY when no rule matches', () => {
  const decision = evaluatePolicy(policy, {
    principalKind: 'MODEL',
    action: 'unknown',
    riskTier: 'NORMAL',
    dataClassification: 'PUBLIC',
  });

  assert.equal(decision.effect, 'DENY');
  assert.deepEqual(decision.matchedRuleIds, []);
});

test('DENY precedence wins over HUMAN_REQUIRED and ALLOW', () => {
  const decision = evaluatePolicy(policy, {
    principalKind: 'MODEL',
    action: 'write',
    riskTier: 'HIGH',
    dataClassification: 'SECRET',
  });

  assert.equal(decision.effect, 'DENY');
  assert.deepEqual(decision.matchedRuleIds, ['deny-secret-write', 'human-high-write']);
});

test('human-required policy creates exact-bound deterministic request', () => {
  const policyDecision = evaluatePolicy(policy, {
    principalKind: 'MODEL',
    action: 'write',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
  });
  assert.equal(policyDecision.effect, 'HUMAN_REQUIRED');

  const input = {
    policyDecision,
    runSnapshotHash: 'run-snapshot',
    repository: 'skonyd/freehighlander-engineering-platform',
    revision: 'abc123',
    action: 'write',
    riskTier: 'HIGH',
    evidenceHash: 'evidence-hash',
  };

  const first = createHumanApprovalRequest(input);
  const second = createHumanApprovalRequest(input);

  assert.equal(first.requestHash, second.requestHash);
  assert.notEqual(
    first.requestHash,
    createHumanApprovalRequest({ ...input, revision: 'different' }).requestHash,
  );
});

test('human request cannot be created from ALLOW or DENY', () => {
  const allow = evaluatePolicy(policy, {
    principalKind: 'MODEL',
    action: 'read',
    riskTier: 'NORMAL',
    dataClassification: 'PUBLIC',
  });

  assert.throws(
    () =>
      createHumanApprovalRequest({
        policyDecision: allow,
        runSnapshotHash: 'run',
        repository: 'repo',
        revision: 'sha',
        action: 'read',
        riskTier: 'NORMAL',
        evidenceHash: 'evidence',
      }),
    /requires HUMAN_REQUIRED/,
  );
});

test('non-human principals cannot record human approval', () => {
  const decision = evaluatePolicy(policy, {
    principalKind: 'MODEL',
    action: 'write',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
  });
  const request = createHumanApprovalRequest({
    policyDecision: decision,
    runSnapshotHash: 'run',
    repository: 'repo',
    revision: 'sha',
    action: 'write',
    riskTier: 'HIGH',
    evidenceHash: 'evidence',
  });

  assert.throws(
    () => recordHumanDecision(request, 'MODEL', 'model-1', 'APPROVE'),
    /requires HUMAN principal/,
  );
  assert.equal(modelCanActAsHumanApprover(), false);
});

test('human decision is bound to exact request and detects replay/mismatch', () => {
  const policyDecision = evaluatePolicy(policy, {
    principalKind: 'MODEL',
    action: 'write',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
  });
  const request = createHumanApprovalRequest({
    policyDecision,
    runSnapshotHash: 'run',
    repository: 'repo',
    revision: 'sha',
    action: 'write',
    riskTier: 'HIGH',
    evidenceHash: 'evidence',
  });
  const decision = recordHumanDecision(request, 'HUMAN', 'user-1', 'APPROVE');

  assert.equal(verifyHumanDecisionBinding(request, decision), true);

  const changedRequest = createHumanApprovalRequest({
    policyDecision,
    runSnapshotHash: 'run',
    repository: 'repo',
    revision: 'sha-2',
    action: 'write',
    riskTier: 'HIGH',
    evidenceHash: 'evidence',
  });
  assert.equal(verifyHumanDecisionBinding(changedRequest, decision), false);
});

test('policy configuration cannot self-approve', () => {
  assert.equal(policyConfigurationCanSelfApprove(), false);
});
