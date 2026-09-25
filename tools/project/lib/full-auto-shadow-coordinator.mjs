// Shadow-only composition layer; execution authority remains outside this coordinator.
import { buildFullAutoReviewerBindingSnapshot } from '../../../packages/model-runtime/dist/index.js';
import { buildFullAutoQuorumArtifact } from '../../../packages/orchestration/dist/index.js';
import {
  evaluateFullAutoMergeIntent,
  revalidateFullAutoPreMerge,
} from '../../../packages/governance/dist/index.js';

export function evaluateFullAutoShadowLifecycle(input) {
  const bindingSnapshot = buildFullAutoReviewerBindingSnapshot({
    reviewerA: input.reviewerAPlan,
    reviewerB: input.reviewerBPlan,
    producerIndependenceGroup: input.producerIndependenceGroup,
  });

  if (bindingSnapshot.riskTier !== input.riskTier) {
    throw new Error('Full Auto lifecycle risk tier does not match reviewer binding snapshot');
  }

  if (input.scope.policyHash !== input.policyDecision.policyHash) {
    throw new Error(
      'Full Auto lifecycle policy decision must bind to the quorum scope policy hash',
    );
  }

  validateReviewerBindingEvidence(
    input.reviewers,
    input.reviewerAPlan,
    input.reviewerBPlan,
    input.scope.reviewScopeHash,
  );

  const quorum = buildFullAutoQuorumArtifact({
    scope: input.scope,
    producerIndependenceGroup: input.producerIndependenceGroup,
    reviewers: input.reviewers,
  });

  const intent = evaluateFullAutoMergeIntent({
    configuration: input.configuration,
    policyDecision: input.policyDecision,
    riskTier: input.riskTier,
    quorumHash: quorum.quorumHash,
    quorumStatus: quorum.status,
    runSnapshotHash: input.scope.runSnapshotHash,
    reviewScopeHash: input.scope.reviewScopeHash,
    deterministicGatesPass: input.gates.deterministicGatesPass,
    exactCurrent: input.gates.exactCurrent,
    reviewerIndependenceValid: true,
    bindingSnapshotCurrent: input.gates.bindingSnapshotCurrent,
    changeBudgetPass: input.gates.changeBudgetPass,
    runtimeContainmentPass: input.gates.runtimeContainmentPass,
    remoteHeadMatches: input.gates.remoteHeadMatches,
    requiredCiCurrent: input.gates.requiredCiCurrent,
    unresolvedBlockingFindings: input.gates.unresolvedBlockingFindings,
  });

  const expected = {
    repository: input.scope.repository,
    pullRequestNumber: input.pullRequestNumber,
    headRevision: input.scope.headRevision,
    baseRevision: input.scope.baseRevision,
    runSnapshotHash: input.scope.runSnapshotHash,
    reviewScopeHash: input.scope.reviewScopeHash,
    policyHash: input.policyDecision.policyHash,
    quorumHash: quorum.quorumHash,
    bindingSnapshotHash: bindingSnapshot.snapshotHash,
    changeBudgetResultHash: input.scope.changeBudgetResultHash,
    runtimeContainmentHash: input.scope.runtimeContainmentHash,
  };

  const observed = {
    pullRequestOpen: input.observed.pullRequestOpen,
    mergeable: input.observed.mergeable,
    headRevision: input.observed.headRevision ?? expected.headRevision,
    baseRevision: input.observed.baseRevision ?? expected.baseRevision,
    runSnapshotHash: input.observed.runSnapshotHash ?? expected.runSnapshotHash,
    reviewScopeHash: input.observed.reviewScopeHash ?? expected.reviewScopeHash,
    policyHash: input.observed.policyHash ?? expected.policyHash,
    quorumHash: input.observed.quorumHash ?? expected.quorumHash,
    bindingSnapshotHash: input.observed.bindingSnapshotHash ?? expected.bindingSnapshotHash,
    changeBudgetResultHash:
      input.observed.changeBudgetResultHash ?? expected.changeBudgetResultHash,
    runtimeContainmentHash:
      input.observed.runtimeContainmentHash ?? expected.runtimeContainmentHash,
    requiredCiCurrent: input.observed.requiredCiCurrent,
    deterministicGatesPass: input.observed.deterministicGatesPass,
    newerRunInvalidated: input.observed.newerRunInvalidated,
  };

  const preMerge = revalidateFullAutoPreMerge({
    intent,
    expected,
    observed,
  });

  const status =
    intent.status === 'SHADOW_INTENT_READY' && preMerge.status === 'CURRENT'
      ? 'SHADOW_READY'
      : 'BLOCKED';

  return {
    schemaVersion: 1,
    status,
    bindingSnapshot,
    quorum,
    intent,
    preMerge,
    shadowMergeCandidate: status === 'SHADOW_READY',
    executionAuthorized: false,
    authority: 'SYSTEM_POLICY',
  };
}

export function fullAutoShadowLifecycleCanExecuteMerge() {
  return false;
}

function validateReviewerBindingEvidence(reviewers, reviewerAPlan, reviewerBPlan, scopeHash) {
  if (!Array.isArray(reviewers) || reviewers.length !== 2) {
    throw new Error('Full Auto lifecycle requires exactly two reviewer evidence records');
  }

  const byRole = new Map(reviewers.map((reviewer) => [reviewer.logicalRole, reviewer]));
  const reviewerA = byRole.get(reviewerAPlan.logicalRole);
  const reviewerB = byRole.get(reviewerBPlan.logicalRole);

  if (!reviewerA || !reviewerB) {
    throw new Error('Full Auto reviewer evidence roles must match reviewer binding plans');
  }
  if (reviewerA.bindingSnapshotHash !== reviewerAPlan.hash) {
    throw new Error('Full Auto reviewer A evidence is not bound to the selected binding plan');
  }
  if (reviewerB.bindingSnapshotHash !== reviewerBPlan.hash) {
    throw new Error('Full Auto reviewer B evidence is not bound to the selected binding plan');
  }
  if (reviewerA.scopeHash !== scopeHash || reviewerB.scopeHash !== scopeHash) {
    throw new Error('Full Auto reviewer evidence must bind to the exact review scope');
  }
}
