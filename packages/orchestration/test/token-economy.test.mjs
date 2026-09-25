import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEconomyLedger,
  economyLedgerCanGrantAuthority,
  evaluateRemoteCallNecessity,
  tokenEconomyCanEscalateSemanticNegativeForShopping,
  tokenEconomyCanSuppressPolicyRequiredRemoteCall,
} from '../dist/index.js';

function necessity(overrides = {}) {
  return {
    mode: 'TOKEN_ECONOMY',
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

function reductions(overrides = {}) {
  return {
    exactDedupeTokens: 100,
    staleSupersededTokens: 50,
    artifactizationTokens: 200,
    repoMapJitTokens: 100,
    lazyToolSchemaTokens: 50,
    localCompressionTokens: 100,
    nodeResultReuseTokens: 0,
    ...overrides,
  };
}

test('Standard mode preserves existing remote-call behavior', () => {
  const result = evaluateRemoteCallNecessity(necessity({ mode: 'STANDARD' }));
  assert.deepEqual(result, {
    status: 'CALL_REMOTE',
    reason: 'STANDARD_MODE',
    authority: 'NONE',
  });
});

test('policy-required and independent remote review cannot be suppressed by Economy Mode', () => {
  assert.deepEqual(evaluateRemoteCallNecessity(necessity({ policyRequiresRemote: true })), {
    status: 'CALL_REMOTE',
    reason: 'POLICY_REQUIRES_REMOTE',
    authority: 'NONE',
  });
  assert.deepEqual(
    evaluateRemoteCallNecessity(necessity({ independentRemoteReviewRequired: true })),
    {
      status: 'CALL_REMOTE',
      reason: 'INDEPENDENT_REMOTE_REVIEW_REQUIRED',
      authority: 'NONE',
    },
  );
  assert.equal(tokenEconomyCanSuppressPolicyRequiredRemoteCall(), false);
});

test('semantic negative does not trigger remote model-shopping', () => {
  const result = evaluateRemoteCallNecessity(
    necessity({
      completedEquivalentSemanticNegative: true,
      eligibleLocalResultAvailable: true,
    }),
  );

  assert.equal(result.status, 'SKIP_REMOTE');
  assert.equal(result.reason, 'SEMANTIC_NEGATIVE_NO_MODEL_SHOPPING');
  assert.equal(tokenEconomyCanEscalateSemanticNegativeForShopping(), false);
});

test('exact reuse local result and deterministic work avoid a new remote call in priority order', () => {
  assert.equal(
    evaluateRemoteCallNecessity(necessity({ exactNodeResultReusable: true })).reason,
    'EXACT_NODE_RESULT_REUSABLE',
  );
  assert.equal(
    evaluateRemoteCallNecessity(necessity({ eligibleLocalResultAvailable: true })).reason,
    'ELIGIBLE_LOCAL_RESULT_AVAILABLE',
  );
  assert.equal(
    evaluateRemoteCallNecessity(necessity({ deterministicResolutionAvailable: true })).reason,
    'DETERMINISTIC_RESOLUTION_AVAILABLE',
  );
});

test('pending batchable read-only work defers the remote call until local batching finishes', () => {
  const result = evaluateRemoteCallNecessity(necessity({ batchableReadOnlyWorkPending: true }));
  assert.equal(result.status, 'DEFER_FOR_LOCAL_BATCH');
  assert.equal(result.reason, 'BATCH_READ_ONLY_WORK_FIRST');
});

test('remote call proceeds when no safe local or reusable result can satisfy the role', () => {
  const result = evaluateRemoteCallNecessity(necessity());
  assert.equal(result.status, 'CALL_REMOTE');
  assert.equal(result.reason, 'REMOTE_RESULT_REQUIRED');
});

test('invalid economy mode fails closed', () => {
  assert.throws(
    () => evaluateRemoteCallNecessity(necessity({ mode: 'UNKNOWN' })),
    /economy mode is invalid/,
  );
});

test('economy ledger exactly reconciles candidate and final remote input tokens', () => {
  const ledger = buildEconomyLedger({
    candidateRemoteInputTokens: 1000,
    reductions: reductions(),
    finalRemoteInputTokens: 400,
    remoteOutputTokens: 120,
    cachedInputTokens: 100,
    remoteCallsAvoided: 2,
    localOnlyCalls: 3,
    extraLocalDurationMs: 900,
  });

  assert.equal(ledger.totalReducedTokens, 600);
  assert.equal(ledger.remoteInputSavingRatio, 0.6);
  assert.equal(ledger.cacheSavingsReportedSeparately, true);
  assert.equal(ledger.authority, 'NONE');
  assert.equal(economyLedgerCanGrantAuthority(), false);
});

test('cache tokens are reported separately and cannot exceed final remote input', () => {
  const ledger = buildEconomyLedger({
    candidateRemoteInputTokens: 100,
    reductions: reductions({
      exactDedupeTokens: 10,
      staleSupersededTokens: 0,
      artifactizationTokens: 0,
      repoMapJitTokens: 0,
      lazyToolSchemaTokens: 0,
      localCompressionTokens: 0,
      nodeResultReuseTokens: 0,
    }),
    finalRemoteInputTokens: 90,
    remoteOutputTokens: 0,
    cachedInputTokens: 90,
    remoteCallsAvoided: 0,
    localOnlyCalls: 0,
    extraLocalDurationMs: 0,
  });
  assert.equal(ledger.cachedInputTokens, 90);

  assert.throws(
    () =>
      buildEconomyLedger({
        candidateRemoteInputTokens: 100,
        reductions: reductions({
          exactDedupeTokens: 10,
          staleSupersededTokens: 0,
          artifactizationTokens: 0,
          repoMapJitTokens: 0,
          lazyToolSchemaTokens: 0,
          localCompressionTokens: 0,
          nodeResultReuseTokens: 0,
        }),
        finalRemoteInputTokens: 90,
        remoteOutputTokens: 0,
        cachedInputTokens: 91,
        remoteCallsAvoided: 0,
        localOnlyCalls: 0,
        extraLocalDurationMs: 0,
      }),
    /cached input tokens cannot exceed/,
  );
});

test('ledger rejects overlapping or malformed accounting that does not reconcile', () => {
  assert.throws(
    () =>
      buildEconomyLedger({
        candidateRemoteInputTokens: 100,
        reductions: reductions({
          exactDedupeTokens: 80,
          staleSupersededTokens: 80,
          artifactizationTokens: 0,
          repoMapJitTokens: 0,
          lazyToolSchemaTokens: 0,
          localCompressionTokens: 0,
          nodeResultReuseTokens: 0,
        }),
        finalRemoteInputTokens: 0,
        remoteOutputTokens: 0,
        cachedInputTokens: 0,
        remoteCallsAvoided: 0,
        localOnlyCalls: 0,
        extraLocalDurationMs: 0,
      }),
    /cannot exceed candidate/,
  );

  assert.throws(
    () =>
      buildEconomyLedger({
        candidateRemoteInputTokens: 1000,
        reductions: reductions(),
        finalRemoteInputTokens: 401,
        remoteOutputTokens: 0,
        cachedInputTokens: 0,
        remoteCallsAvoided: 0,
        localOnlyCalls: 0,
        extraLocalDurationMs: 0,
      }),
    /does not reconcile/,
  );

  assert.throws(
    () =>
      buildEconomyLedger({
        candidateRemoteInputTokens: -1,
        reductions: reductions({
          exactDedupeTokens: 0,
          staleSupersededTokens: 0,
          artifactizationTokens: 0,
          repoMapJitTokens: 0,
          lazyToolSchemaTokens: 0,
          localCompressionTokens: 0,
          nodeResultReuseTokens: 0,
        }),
        finalRemoteInputTokens: 0,
        remoteOutputTokens: 0,
        cachedInputTokens: 0,
        remoteCallsAvoided: 0,
        localOnlyCalls: 0,
        extraLocalDurationMs: 0,
      }),
    /non-negative integer/,
  );
});

test('zero-token candidate produces a zero saving ratio', () => {
  const ledger = buildEconomyLedger({
    candidateRemoteInputTokens: 0,
    reductions: reductions({
      exactDedupeTokens: 0,
      staleSupersededTokens: 0,
      artifactizationTokens: 0,
      repoMapJitTokens: 0,
      lazyToolSchemaTokens: 0,
      localCompressionTokens: 0,
      nodeResultReuseTokens: 0,
    }),
    finalRemoteInputTokens: 0,
    remoteOutputTokens: 0,
    cachedInputTokens: 0,
    remoteCallsAvoided: 1,
    localOnlyCalls: 1,
    extraLocalDurationMs: 10,
  });

  assert.equal(ledger.remoteInputSavingRatio, 0);
});
