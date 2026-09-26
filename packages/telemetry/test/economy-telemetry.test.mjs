import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEconomyRuntimeSummaryTelemetry,
  economyTelemetryCanGrantAuthority,
  economyTelemetryCanInvokeModel,
} from '../dist/index.js';

function input(overrides = {}) {
  return {
    mode: 'TOKEN_ECONOMY',
    optimizerBindingId: 'context-optimizer-local',
    optimizerModelId: 'local-model',
    remoteTokenTarget: 2000,
    candidateRemoteInputTokens: 4000,
    finalRemoteInputTokens: 2000,
    remoteOutputTokens: 300,
    cachedInputTokens: 500,
    reductionStages: ['REPOSITORY_JIT', 'DETERMINISTIC_REDUCTION'],
    protectedContentCount: 7,
    localOptimizationDurationMs: 900,
    remoteTokenSavingRatio: 0.5,
    roleEligibility: [
      { logicalRole: 'reviewer', riskTier: 'HIGH', eligible: false, reason: 'remote required' },
      { logicalRole: 'context-optimizer', riskTier: 'NORMAL', eligible: true },
    ],
    ...overrides,
  };
}

test('economy runtime telemetry is metadata-only reconciled and deterministic', () => {
  const payload = buildEconomyRuntimeSummaryTelemetry(input());

  assert.equal(payload.mode, 'TOKEN_ECONOMY');
  assert.equal(payload.optimizerBindingId, 'context-optimizer-local');
  assert.equal(payload.finalRemoteInputTokens, 2000);
  assert.equal(payload.remoteTokenSavingRatio, 0.5);
  assert.deepEqual(payload.reductionStages, ['DETERMINISTIC_REDUCTION', 'REPOSITORY_JIT']);
  assert.deepEqual(
    payload.roleEligibility.map((entry) => entry.logicalRole),
    ['context-optimizer', 'reviewer'],
  );
  assert.equal(payload.authority, 'NONE');
  assert.equal('prompt' in payload, false);
  assert.equal('completion' in payload, false);
});

test('standard telemetry supports absent optional optimizer metadata', () => {
  const payload = buildEconomyRuntimeSummaryTelemetry(
    input({
      mode: 'STANDARD',
      optimizerBindingId: undefined,
      optimizerModelId: undefined,
      remoteTokenTarget: undefined,
      bypassReason: 'Standard mode selected',
      candidateRemoteInputTokens: 1000,
      finalRemoteInputTokens: 1000,
      cachedInputTokens: 100,
      remoteTokenSavingRatio: 0,
      reductionStages: [],
      roleEligibility: [],
    }),
  );

  assert.equal(payload.mode, 'STANDARD');
  assert.equal('optimizerBindingId' in payload, false);
  assert.equal('remoteTokenTarget' in payload, false);
  assert.equal(payload.bypassReason, 'Standard mode selected');
});

test('economy telemetry rejects malformed accounting and unsafe metadata', () => {
  for (const bad of [
    { mode: 'INVALID' },
    { candidateRemoteInputTokens: -1 },
    { finalRemoteInputTokens: 4001 },
    { cachedInputTokens: 2001 },
    { remoteTokenSavingRatio: -0.1 },
    { remoteTokenSavingRatio: 0.7 },
    { remoteTokenTarget: 1.5 },
    { optimizerBindingId: ' ' },
    { bypassReason: 'line one\nline two' },
  ]) {
    assert.throws(() => buildEconomyRuntimeSummaryTelemetry(input(bad)));
  }

  assert.throws(
    () =>
      buildEconomyRuntimeSummaryTelemetry(
        input({ reductionStages: ['REPOSITORY_JIT', 'REPOSITORY_JIT'] }),
      ),
    /duplicate reduction stage/,
  );

  assert.throws(
    () =>
      buildEconomyRuntimeSummaryTelemetry(
        input({
          roleEligibility: [
            { logicalRole: 'reviewer', riskTier: 'HIGH', eligible: true },
            { logicalRole: 'reviewer', riskTier: 'HIGH', eligible: false },
          ],
        }),
      ),
    /duplicate economy role eligibility/,
  );

  assert.throws(
    () =>
      buildEconomyRuntimeSummaryTelemetry(
        input({
          roleEligibility: [{ logicalRole: 'reviewer', riskTier: 'INVALID', eligible: true }],
        }),
      ),
    /riskTier is invalid/,
  );
});

test('zero-token candidate requires zero saving ratio', () => {
  const payload = buildEconomyRuntimeSummaryTelemetry(
    input({
      candidateRemoteInputTokens: 0,
      finalRemoteInputTokens: 0,
      remoteOutputTokens: 0,
      cachedInputTokens: 0,
      remoteTokenSavingRatio: 0,
    }),
  );
  assert.equal(payload.remoteTokenSavingRatio, 0);

  assert.throws(
    () =>
      buildEconomyRuntimeSummaryTelemetry(
        input({
          candidateRemoteInputTokens: 0,
          finalRemoteInputTokens: 0,
          remoteOutputTokens: 0,
          cachedInputTokens: 0,
          remoteTokenSavingRatio: 0.1,
        }),
      ),
    /must reconcile/,
  );
});

test('economy telemetry remains observer-only', () => {
  assert.equal(economyTelemetryCanGrantAuthority(), false);
  assert.equal(economyTelemetryCanInvokeModel(), false);
});
