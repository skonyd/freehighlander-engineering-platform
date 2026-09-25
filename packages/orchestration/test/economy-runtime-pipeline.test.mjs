import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIntegratedEconomyRuntimePlan,
  buildRepositoryMap,
  economyPipelineCanInvokeRemoteWithInvalidProtectedAnchors,
  economyPipelineUsesLossyOptimizationBeforeDeterministicStages,
  integratedEconomyRuntimeCanGrantAuthority,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function necessity(overrides = {}) {
  return {
    policyRequiresRemote: false,
    independentRemoteReviewRequired: false,
    completedEquivalentSemanticNegative: false,
    exactNodeResultReusable: false,
    eligibleLocalResultAvailable: false,
    deterministicResolutionAvailable: false,
    batchableReadOnlyWorkPending: false,
    ...overrides,
  };
}

function contextItems() {
  return [
    {
      id: 'required-policy',
      contentHash: hash('a'),
      estimatedTokens: 100,
      compressionClass: 'PROTECTED',
      lifecycleState: 'PROTECTED',
      requiredByGate: true,
    },
    {
      id: 'duplicate-a',
      contentHash: hash('b'),
      estimatedTokens: 200,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'duplicate-b',
      contentHash: hash('b'),
      estimatedTokens: 200,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'stale-log',
      contentHash: hash('c'),
      estimatedTokens: 100,
      compressionClass: 'EXTRACTIVE',
      lifecycleState: 'EXPIRED',
    },
    {
      id: 'supporting-prose',
      contentHash: hash('d'),
      estimatedTokens: 500,
      compressionClass: 'SEMANTIC_ALLOWED',
      lifecycleState: 'ACTIVE',
    },
  ];
}

function repository() {
  return {
    map: buildRepositoryMap('abc123', [
      {
        path: 'src/required.ts',
        symbols: ['requiredPolicy'],
        imports: [],
        estimatedTokens: 400,
      },
      {
        path: 'src/unrelated.ts',
        symbols: ['unrelated'],
        imports: [],
        estimatedTokens: 600,
      },
    ]),
    query: 'required policy',
    changedPaths: ['src/required.ts'],
    requiredPaths: ['src/required.ts'],
    targetTokens: 500,
  };
}

function tools() {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index === 0 ? 'core.read' : `optional.tool-${index}`,
    namespace: index === 0 ? 'core' : 'optional',
    keywords: index === 1 ? ['required'] : [`keyword-${index}`],
    estimatedSchemaTokens: 100,
    ...(index === 0 ? { core: true } : {}),
  }));
}

function economyInput(overrides = {}) {
  const exactAnchor = 'deadbeef';
  return {
    mode: 'TOKEN_ECONOMY',
    candidateRemoteInputTokens: 5000,
    contextItems: contextItems(),
    repository: repository(),
    toolSelection: {
      tools: tools(),
      query: 'required',
      maxActivated: 2,
    },
    protectedContext: {
      sourceText: `policy exact revision ${exactAnchor} supporting context`,
      optimizedText: `policy exact revision ${exactAnchor}`,
      anchors: [{ id: 'exact-revision', value: exactAnchor }],
    },
    remoteNecessity: necessity(),
    localOptimizer: {
      binding: {
        bindingId: 'local-optimizer',
        bindingPlanHash: hash('1'),
        qualificationHash: hash('2'),
        modelId: 'local-model',
        providerId: 'local-provider',
        locality: 'LOCAL',
        eligibleForRoleRisk: true,
      },
      policy: {
        targetRemoteTokens: 1000,
        maxLocalPasses: 1,
        minimumIncrementalSavingTokens: 100,
      },
      observation: {
        pass: 1,
        inputTokens: 2000,
        outputTokens: 1500,
        requiredEvidenceTokens: 500,
        protectedAnchorVerificationPassed: true,
        optimizerHealthy: true,
      },
    },
    artifactizationTokens: 300,
    nodeResultReuseTokens: 0,
    remoteOutputTokens: 120,
    cachedInputTokens: 100,
    priorRemoteCallsAvoided: 0,
    priorLocalOnlyCalls: 0,
    extraLocalDurationMs: 900,
    ...overrides,
  };
}

test('Standard mode preserves the unoptimized remote path', () => {
  const plan = buildIntegratedEconomyRuntimePlan({
    mode: 'STANDARD',
    candidateRemoteInputTokens: 5000,
    remoteOutputTokens: 120,
    cachedInputTokens: 100,
    remoteNecessity: necessity({ eligibleLocalResultAvailable: true }),
  });

  assert.equal(plan.status, 'READY_FOR_REMOTE');
  assert.equal(plan.optimizationApplied, false);
  assert.equal(plan.remoteCallDecision.reason, 'STANDARD_MODE');
  assert.equal(plan.remoteInvocationAllowed, true);
  assert.deepEqual(plan.stageOrder, []);
  assert.equal(plan.ledger.finalRemoteInputTokens, 5000);
  assert.equal(plan.ledger.totalReducedTokens, 0);
});

test('Economy pipeline composes deterministic reduction JIT lazy tools local optimization and ledger', () => {
  const plan = buildIntegratedEconomyRuntimePlan(economyInput());

  assert.equal(plan.status, 'READY_FOR_REMOTE');
  assert.equal(plan.remoteInvocationAllowed, true);
  assert.deepEqual(plan.stageOrder, [
    'DETERMINISTIC_REDUCTION',
    'REPOSITORY_JIT',
    'LAZY_TOOL_SCHEMA',
    'LOCAL_OPTIMIZER',
    'PROTECTED_ANCHOR_VERIFY',
    'REMOTE_NECESSITY',
    'ECONOMY_LEDGER',
  ]);
  assert.equal(
    plan.reductionPlan.items.find((item) => item.id === 'duplicate-b').action,
    'DROP_EXACT_DUPLICATE',
  );
  assert.equal(plan.repositorySelection.selectedPaths.includes('src/required.ts'), true);
  assert.equal(plan.toolExposurePlan.profile, 'MEDIUM');
  assert.equal(plan.toolActivation.activatedToolIds.includes('core.read'), true);
  assert.equal(plan.optimizerDecision.incrementalSavingTokens, 500);
  assert.equal(plan.protectedAnchorVerification.status, 'PASS');
  assert.equal(plan.ledger.reductions.exactDedupeTokens, 200);
  assert.equal(plan.ledger.reductions.staleSupersededTokens, 100);
  assert.equal(plan.ledger.reductions.repoMapJitTokens, 600);
  assert.equal(plan.ledger.reductions.lazyToolSchemaTokens, 800);
  assert.equal(plan.ledger.reductions.localCompressionTokens, 500);
  assert.equal(plan.ledger.reductions.artifactizationTokens, 300);
  assert.equal(plan.ledger.finalRemoteInputTokens, 2500);
  assert.equal(plan.authority, 'NONE');
});

test('missing protected anchor blocks a required remote call before invocation', () => {
  const plan = buildIntegratedEconomyRuntimePlan(
    economyInput({
      protectedContext: {
        sourceText: 'required deadbeef',
        optimizedText: 'required but identifier disappeared',
        anchors: [{ id: 'exact-revision', value: 'deadbeef' }],
      },
      localOptimizer: undefined,
      remoteNecessity: necessity({ policyRequiresRemote: true }),
    }),
  );

  assert.equal(plan.remoteCallDecision.reason, 'POLICY_REQUIRES_REMOTE');
  assert.equal(plan.status, 'BLOCKED_INVALID_PACKET');
  assert.equal(plan.remoteInvocationAllowed, false);
  assert.equal(plan.protectedAnchorVerification.status, 'FAIL');
  assert.equal(economyPipelineCanInvokeRemoteWithInvalidProtectedAnchors(), false);
});

test('exact reusable result skips the remote call and is recorded as an avoided call', () => {
  const plan = buildIntegratedEconomyRuntimePlan(
    economyInput({
      remoteNecessity: necessity({ exactNodeResultReusable: true }),
      nodeResultReuseTokens: 200,
    }),
  );

  assert.equal(plan.status, 'REMOTE_SKIPPED');
  assert.equal(plan.remoteInvocationAllowed, false);
  assert.equal(plan.remoteCallDecision.reason, 'EXACT_NODE_RESULT_REUSABLE');
  assert.equal(plan.ledger.remoteCallsAvoided, 1);
});

test('local optimizer failure falls back to uncompressed protected context safely', () => {
  const input = economyInput();
  const plan = buildIntegratedEconomyRuntimePlan({
    ...input,
    protectedContext: {
      sourceText: 'required deadbeef',
      optimizedText: 'broken compressed packet',
      anchors: [{ id: 'exact-revision', value: 'deadbeef' }],
    },
    localOptimizer: {
      ...input.localOptimizer,
      observation: {
        ...input.localOptimizer.observation,
        optimizerHealthy: false,
      },
    },
  });

  assert.equal(plan.optimizerDecision.nextAction, 'FALLBACK_UNCOMPRESSED');
  assert.equal(plan.protectedAnchorVerification.status, 'PASS');
  assert.equal(plan.ledger.reductions.localCompressionTokens, 0);
  assert.equal(plan.remoteInvocationAllowed, true);
});

test('integrated pipeline remains authority-neutral and deterministic-first', () => {
  assert.equal(integratedEconomyRuntimeCanGrantAuthority(), false);
  assert.equal(economyPipelineUsesLossyOptimizationBeforeDeterministicStages(), false);
});
