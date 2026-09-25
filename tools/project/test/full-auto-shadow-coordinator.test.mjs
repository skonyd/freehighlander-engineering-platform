import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  resolveBindingPlan,
} from '../../../packages/model-runtime/dist/index.js';
import {
  evaluateFullAutoShadowLifecycle,
  fullAutoShadowLifecycleCanExecuteMerge,
} from '../lib/full-auto-shadow-coordinator.mjs';

const hash = (character) => character.repeat(64);

function provider(id) {
  return {
    id,
    capabilities() {
      return new Set();
    },
    async health() {
      return { available: true };
    },
    async invoke(request) {
      return { output: 'ok', model: request.model };
    },
  };
}

function setupPlans() {
  const providers = new ProviderRegistry();
  providers.register(provider('p-a'));
  providers.register(provider('p-b'));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'a-primary',
    version: '1.0.0',
    providerId: 'p-a',
    model: 'model-a',
    effort: 'medium',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'group-a',
  });
  bindings.register({
    id: 'b-primary',
    version: '1.0.0',
    providerId: 'p-b',
    model: 'model-b',
    effort: 'low',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'group-b',
  });

  return {
    reviewerAPlan: resolveBindingPlan(providers, bindings, {
      logicalRole: 'autonomous-merge-reviewer-a',
      riskTier: 'NORMAL',
      primaryBindingId: 'a-primary',
      fallbackBindingIds: [],
    }),
    reviewerBPlan: resolveBindingPlan(providers, bindings, {
      logicalRole: 'autonomous-merge-reviewer-b',
      riskTier: 'NORMAL',
      primaryBindingId: 'b-primary',
      fallbackBindingIds: [],
    }),
  };
}

function baseInput(overrides = {}) {
  const { reviewerAPlan, reviewerBPlan } = setupPlans();
  const scope = {
    repository: 'skonyd/freehighlander-engineering-platform',
    headRevision: 'a'.repeat(40),
    baseRevision: 'b'.repeat(40),
    runSnapshotHash: hash('1'),
    policyHash: hash('2'),
    catalogSnapshotHash: hash('3'),
    requiredEvidenceHash: hash('4'),
    reviewScopeHash: hash('5'),
    changeBudgetResultHash: hash('6'),
    runtimeContainmentHash: hash('7'),
  };

  return {
    reviewerAPlan,
    reviewerBPlan,
    producerIndependenceGroup: 'producer',
    riskTier: 'NORMAL',
    scope,
    reviewers: [
      {
        reviewerId: 'reviewer-a',
        logicalRole: reviewerAPlan.logicalRole,
        bindingSnapshotHash: reviewerAPlan.hash,
        independenceGroup: 'group-a',
        round: 0,
        peerContextUsed: false,
        verdict: 'APPROVE',
        findingsHash: hash('8'),
        scopeHash: scope.reviewScopeHash,
      },
      {
        reviewerId: 'reviewer-b',
        logicalRole: reviewerBPlan.logicalRole,
        bindingSnapshotHash: reviewerBPlan.hash,
        independenceGroup: 'group-b',
        round: 0,
        peerContextUsed: false,
        verdict: 'APPROVE',
        findingsHash: hash('9'),
        scopeHash: scope.reviewScopeHash,
      },
    ],
    configuration: { profile: 'SAFE' },
    policyDecision: {
      effect: 'MODEL_QUORUM_REQUIRED',
      matchedRuleIds: ['full-auto-normal'],
      policyHash: scope.policyHash,
      reason: 'exact Full Auto policy match',
    },
    gates: {
      deterministicGatesPass: true,
      exactCurrent: true,
      bindingSnapshotCurrent: true,
      changeBudgetPass: true,
      runtimeContainmentPass: true,
      remoteHeadMatches: true,
      requiredCiCurrent: true,
      unresolvedBlockingFindings: false,
    },
    pullRequestNumber: 271,
    observed: {
      pullRequestOpen: true,
      mergeable: true,
      requiredCiCurrent: true,
      deterministicGatesPass: true,
      newerRunInvalidated: false,
    },
    ...overrides,
  };
}

test('exact approved lifecycle reaches shadow-ready after system policy and pre-merge revalidation', () => {
  const result = evaluateFullAutoShadowLifecycle(baseInput());

  assert.equal(result.bindingSnapshot.authority, 'NONE');
  assert.equal(result.quorum.status, 'APPROVED');
  assert.equal(result.quorum.authorityGranted, false);
  assert.equal(result.intent.status, 'SHADOW_INTENT_READY');
  assert.equal(result.intent.authority, 'SYSTEM_POLICY');
  assert.equal(result.preMerge.status, 'CURRENT');
  assert.equal(result.status, 'SHADOW_READY');
  assert.equal(result.shadowMergeCandidate, true);
  assert.equal(result.executionAuthorized, false);
  assert.equal(fullAutoShadowLifecycleCanExecuteMerge(), false);
});

test('a reviewer rejection blocks the lifecycle before merge readiness', () => {
  const input = baseInput();
  const result = evaluateFullAutoShadowLifecycle({
    ...input,
    reviewers: [input.reviewers[0], { ...input.reviewers[1], verdict: 'REJECT' }],
  });

  assert.equal(result.quorum.status, 'REJECTED');
  assert.equal(result.intent.status, 'BLOCKED');
  assert.equal(result.intent.reason, 'QUORUM_NOT_APPROVED');
  assert.equal(result.preMerge.reason, 'INTENT_NOT_READY');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.executionAuthorized, false);
});

test('remote HEAD change blocks exact pre-merge revalidation', () => {
  const input = baseInput();
  const result = evaluateFullAutoShadowLifecycle({
    ...input,
    observed: {
      ...input.observed,
      headRevision: 'c'.repeat(40),
    },
  });

  assert.equal(result.intent.status, 'SHADOW_INTENT_READY');
  assert.equal(result.preMerge.status, 'BLOCKED');
  assert.equal(result.preMerge.reason, 'HEAD_CHANGED');
  assert.equal(result.status, 'BLOCKED');
});

test('true HUMAN_REQUIRED remains non-delegable even with two model approvals', () => {
  const input = baseInput();
  const result = evaluateFullAutoShadowLifecycle({
    ...input,
    policyDecision: {
      ...input.policyDecision,
      effect: 'HUMAN_REQUIRED',
    },
  });

  assert.equal(result.quorum.status, 'APPROVED');
  assert.equal(result.intent.reason, 'HUMAN_REQUIRED');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.executionAuthorized, false);
});

test('review evidence must bind to selected reviewer plans and exact policy scope', () => {
  const input = baseInput();

  assert.throws(
    () =>
      evaluateFullAutoShadowLifecycle({
        ...input,
        reviewers: [{ ...input.reviewers[0], bindingSnapshotHash: hash('f') }, input.reviewers[1]],
      }),
    /reviewer A evidence is not bound/,
  );

  assert.throws(
    () =>
      evaluateFullAutoShadowLifecycle({
        ...input,
        policyDecision: {
          ...input.policyDecision,
          policyHash: hash('e'),
        },
      }),
    /policy decision must bind/,
  );
});

test('unsafe reviewer independence fails before quorum or policy evaluation', () => {
  const input = baseInput();
  const { reviewerAPlan } = input;

  assert.throws(
    () =>
      evaluateFullAutoShadowLifecycle({
        ...input,
        reviewerBPlan: {
          ...input.reviewerBPlan,
          logicalRole: reviewerAPlan.logicalRole,
        },
      }),
    /binding plan hash mismatch|distinct logical roles/,
  );
});
