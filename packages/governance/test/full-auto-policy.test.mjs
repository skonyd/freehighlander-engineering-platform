import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateFullAutoMergeIntent,
  fullAutoMergeIntentCanExecuteInShadowMode,
  fullAutoProfileCanDelegateRisk,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

const quorumPolicyDecision = {
  effect: 'MODEL_QUORUM_REQUIRED',
  matchedRuleIds: ['quorum-normal-merge'],
  policyHash: hash('1'),
  reason: 'matched policy rules resolve to MODEL_QUORUM_REQUIRED',
};

function input(overrides = {}) {
  return {
    configuration: { profile: 'BALANCED' },
    policyDecision: quorumPolicyDecision,
    riskTier: 'NORMAL',
    quorumHash: hash('2'),
    quorumStatus: 'APPROVED',
    runSnapshotHash: hash('3'),
    reviewScopeHash: hash('4'),
    deterministicGatesPass: true,
    exactCurrent: true,
    reviewerIndependenceValid: true,
    bindingSnapshotCurrent: true,
    changeBudgetPass: true,
    runtimeContainmentPass: true,
    remoteHeadMatches: true,
    requiredCiCurrent: true,
    unresolvedBlockingFindings: false,
    ...overrides,
  };
}

test('Full Auto defaults can remain OFF and OFF never creates merge intent', () => {
  const decision = evaluateFullAutoMergeIntent(
    input({ configuration: { profile: 'OFF' } }),
  );

  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.reason, 'PROFILE_OFF');
  assert.equal(decision.executionAuthorized, false);
  assert.equal(decision.authority, 'SYSTEM_POLICY');
  assert.equal(fullAutoMergeIntentCanExecuteInShadowMode(), false);
});

test('SAFE delegates NORMAL only while BALANCED delegates NORMAL and HIGH', () => {
  assert.equal(fullAutoProfileCanDelegateRisk({ profile: 'SAFE' }, 'NORMAL'), true);
  assert.equal(fullAutoProfileCanDelegateRisk({ profile: 'SAFE' }, 'HIGH'), false);
  assert.equal(fullAutoProfileCanDelegateRisk({ profile: 'BALANCED' }, 'NORMAL'), true);
  assert.equal(fullAutoProfileCanDelegateRisk({ profile: 'BALANCED' }, 'HIGH'), true);
  assert.equal(fullAutoProfileCanDelegateRisk({ profile: 'BALANCED' }, 'CRITICAL'), false);
});

test('CUSTOM risk delegation is explicit and deterministic', () => {
  const configuration = {
    profile: 'CUSTOM',
    customAllowedRiskTiers: ['HIGH', 'NORMAL', 'HIGH'],
  };

  assert.equal(fullAutoProfileCanDelegateRisk(configuration, 'NORMAL'), true);
  assert.equal(fullAutoProfileCanDelegateRisk(configuration, 'HIGH'), true);
  assert.equal(fullAutoProfileCanDelegateRisk(configuration, 'CRITICAL'), false);

  assert.throws(
    () => fullAutoProfileCanDelegateRisk({ profile: 'CUSTOM' }, 'NORMAL'),
    /requires at least one allowed risk tier/,
  );
});

test('approved exact-current quorum can create shadow merge intent but not execution authority', () => {
  const first = evaluateFullAutoMergeIntent(input());
  const second = evaluateFullAutoMergeIntent(input());

  assert.equal(first.status, 'SHADOW_INTENT_READY');
  assert.equal(first.reason, 'READY');
  assert.equal(first.executionAuthorized, false);
  assert.equal(first.authority, 'SYSTEM_POLICY');
  assert.equal(first.decisionHash, second.decisionHash);
});

test('HUMAN_REQUIRED and DENY cannot be delegated to Full Auto quorum', () => {
  const human = evaluateFullAutoMergeIntent(
    input({
      policyDecision: {
        ...quorumPolicyDecision,
        effect: 'HUMAN_REQUIRED',
      },
    }),
  );
  assert.equal(human.status, 'BLOCKED');
  assert.equal(human.reason, 'HUMAN_REQUIRED');

  const denied = evaluateFullAutoMergeIntent(
    input({
      policyDecision: {
        ...quorumPolicyDecision,
        effect: 'DENY',
      },
    }),
  );
  assert.equal(denied.status, 'BLOCKED');
  assert.equal(denied.reason, 'POLICY_DENY');
});

test('ALLOW alone is not a Full Auto quorum authorization source', () => {
  const decision = evaluateFullAutoMergeIntent(
    input({
      policyDecision: {
        ...quorumPolicyDecision,
        effect: 'ALLOW',
      },
    }),
  );

  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.reason, 'POLICY_NOT_QUORUM');
});

test('non-approved quorum and every currentness or safety guard fail closed', () => {
  const cases = [
    [{ quorumStatus: 'REJECTED' }, 'QUORUM_NOT_APPROVED'],
    [{ deterministicGatesPass: false }, 'DETERMINISTIC_GATE_FAILED'],
    [{ exactCurrent: false }, 'STALE_SCOPE'],
    [{ reviewerIndependenceValid: false }, 'INDEPENDENCE_INVALID'],
    [{ bindingSnapshotCurrent: false }, 'BINDING_SNAPSHOT_STALE'],
    [{ changeBudgetPass: false }, 'CHANGE_BUDGET_FAILED'],
    [{ runtimeContainmentPass: false }, 'RUNTIME_CONTAINMENT_FAILED'],
    [{ remoteHeadMatches: false }, 'REMOTE_HEAD_MISMATCH'],
    [{ requiredCiCurrent: false }, 'CI_NOT_CURRENT'],
    [{ unresolvedBlockingFindings: true }, 'BLOCKING_FINDINGS'],
  ];

  for (const [override, reason] of cases) {
    const decision = evaluateFullAutoMergeIntent(input(override));
    assert.equal(decision.status, 'BLOCKED');
    assert.equal(decision.reason, reason);
    assert.equal(decision.executionAuthorized, false);
  }
});

test('risk outside the selected profile is blocked before quorum use', () => {
  const decision = evaluateFullAutoMergeIntent(
    input({
      configuration: { profile: 'SAFE' },
      riskTier: 'HIGH',
    }),
  );

  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.reason, 'RISK_NOT_DELEGATED');
});

test('decision identity changes when exact quorum or currentness inputs change', () => {
  const baseline = evaluateFullAutoMergeIntent(input());
  const changedQuorum = evaluateFullAutoMergeIntent(input({ quorumHash: hash('5') }));
  const changedCurrentness = evaluateFullAutoMergeIntent(
    input({ exactCurrent: false }),
  );

  assert.notEqual(baseline.decisionHash, changedQuorum.decisionHash);
  assert.notEqual(baseline.decisionHash, changedCurrentness.decisionHash);
});
