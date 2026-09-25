import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateFullAutoMergeIntent,
  fullAutoPreMergeRevalidationCanExecuteInShadowMode,
  revalidateFullAutoPreMerge,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

const expected = {
  repository: 'skonyd/freehighlander-engineering-platform',
  pullRequestNumber: 243,
  headRevision: 'a'.repeat(40),
  baseRevision: 'b'.repeat(40),
  runSnapshotHash: hash('1'),
  reviewScopeHash: hash('2'),
  policyHash: hash('3'),
  quorumHash: hash('4'),
  bindingSnapshotHash: hash('5'),
  changeBudgetResultHash: hash('6'),
  runtimeContainmentHash: hash('7'),
};

function readyIntent(overrides = {}) {
  return evaluateFullAutoMergeIntent({
    configuration: { profile: 'BALANCED' },
    policyDecision: {
      effect: 'MODEL_QUORUM_REQUIRED',
      matchedRuleIds: ['quorum-normal-merge'],
      policyHash: expected.policyHash,
      reason: 'matched policy rules resolve to MODEL_QUORUM_REQUIRED',
    },
    riskTier: 'NORMAL',
    quorumHash: expected.quorumHash,
    quorumStatus: 'APPROVED',
    runSnapshotHash: expected.runSnapshotHash,
    reviewScopeHash: expected.reviewScopeHash,
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
  });
}

function observed(overrides = {}) {
  return {
    pullRequestOpen: true,
    mergeable: true,
    headRevision: expected.headRevision,
    baseRevision: expected.baseRevision,
    runSnapshotHash: expected.runSnapshotHash,
    reviewScopeHash: expected.reviewScopeHash,
    policyHash: expected.policyHash,
    quorumHash: expected.quorumHash,
    bindingSnapshotHash: expected.bindingSnapshotHash,
    changeBudgetResultHash: expected.changeBudgetResultHash,
    runtimeContainmentHash: expected.runtimeContainmentHash,
    requiredCiCurrent: true,
    deterministicGatesPass: true,
    newerRunInvalidated: false,
    ...overrides,
  };
}

test('exact-current pre-merge state creates shadow-only CURRENT revalidation', () => {
  const first = revalidateFullAutoPreMerge({
    intent: readyIntent(),
    expected,
    observed: observed(),
  });
  const second = revalidateFullAutoPreMerge({
    intent: readyIntent(),
    expected,
    observed: observed(),
  });

  assert.equal(first.status, 'CURRENT');
  assert.equal(first.reason, 'CURRENT');
  assert.equal(first.executionAuthorized, false);
  assert.equal(first.authority, 'SYSTEM_POLICY');
  assert.equal(first.revalidationHash, second.revalidationHash);
  assert.equal(fullAutoPreMergeRevalidationCanExecuteInShadowMode(), false);
});

test('remote PR and exact revision changes fail closed', () => {
  const cases = [
    [{ pullRequestOpen: false }, 'PR_CLOSED'],
    [{ mergeable: false }, 'PR_NOT_MERGEABLE'],
    [{ headRevision: 'c'.repeat(40) }, 'HEAD_CHANGED'],
    [{ baseRevision: 'd'.repeat(40) }, 'BASE_CHANGED'],
  ];

  for (const [change, reason] of cases) {
    const result = revalidateFullAutoPreMerge({
      intent: readyIntent(),
      expected,
      observed: observed(change),
    });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reason, reason);
    assert.equal(result.executionAuthorized, false);
  }
});

test('snapshot, policy, quorum and containment changes fail closed', () => {
  const cases = [
    [{ runSnapshotHash: hash('8') }, 'RUN_SNAPSHOT_CHANGED'],
    [{ reviewScopeHash: hash('8') }, 'REVIEW_SCOPE_CHANGED'],
    [{ policyHash: hash('8') }, 'POLICY_CHANGED'],
    [{ quorumHash: hash('8') }, 'QUORUM_CHANGED'],
    [{ bindingSnapshotHash: hash('8') }, 'BINDING_SNAPSHOT_CHANGED'],
    [{ changeBudgetResultHash: hash('8') }, 'CHANGE_BUDGET_CHANGED'],
    [{ runtimeContainmentHash: hash('8') }, 'RUNTIME_CONTAINMENT_CHANGED'],
    [{ requiredCiCurrent: false }, 'CI_NOT_CURRENT'],
    [{ deterministicGatesPass: false }, 'DETERMINISTIC_GATE_FAILED'],
    [{ newerRunInvalidated: true }, 'NEWER_RUN_INVALIDATED'],
  ];

  for (const [change, reason] of cases) {
    const result = revalidateFullAutoPreMerge({
      intent: readyIntent(),
      expected,
      observed: observed(change),
    });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reason, reason);
  }
});

test('a blocked Full Auto intent cannot become current during pre-merge revalidation', () => {
  const result = revalidateFullAutoPreMerge({
    intent: readyIntent({ exactCurrent: false }),
    expected,
    observed: observed(),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'INTENT_NOT_READY');
});

test('pre-merge expectation must bind to the exact merge-intent evidence', () => {
  assert.throws(
    () =>
      revalidateFullAutoPreMerge({
        intent: readyIntent(),
        expected: { ...expected, quorumHash: hash('8') },
        observed: observed({ quorumHash: hash('8') }),
      }),
    /intent quorum hash does not match/,
  );

  assert.throws(
    () =>
      revalidateFullAutoPreMerge({
        intent: readyIntent(),
        expected: { ...expected, runSnapshotHash: hash('8') },
        observed: observed({ runSnapshotHash: hash('8') }),
      }),
    /intent run snapshot does not match/,
  );
});

test('revalidation identity changes when observed currentness changes', () => {
  const current = revalidateFullAutoPreMerge({
    intent: readyIntent(),
    expected,
    observed: observed(),
  });
  const stale = revalidateFullAutoPreMerge({
    intent: readyIntent(),
    expected,
    observed: observed({ requiredCiCurrent: false }),
  });

  assert.notEqual(current.revalidationHash, stale.revalidationHash);
});

test('invalid pull-request identity fails before a revalidation artifact is created', () => {
  assert.throws(
    () =>
      revalidateFullAutoPreMerge({
        intent: readyIntent(),
        expected: { ...expected, pullRequestNumber: 0 },
        observed: observed(),
      }),
    /pullRequestNumber must be a positive integer/,
  );
});
