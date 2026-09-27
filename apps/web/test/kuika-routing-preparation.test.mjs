import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaRoutingCandidateFromTelemetryV1,
  buildFhKuikaRoutingFailoverPlanV1,
  optimizeFhKuikaRoutingV1,
  routingFailoverPlanCanApplyRuntime,
  routingFailoverPlanCanGrantAuthority,
  routingFailoverPlanCanRetrySemanticFailure,
  routingTelemetryCanGrantAuthority,
  routingTelemetryCanUseSemanticOutcome,
} from '../dist/index.js';

test('routing telemetry produces deterministic pre-call candidate evidence only', () => {
  const built = buildFhKuikaRoutingCandidateFromTelemetryV1({
    bindingId: 'review-primary',
    provider: 'openai',
    model: 'gpt',
    locality: 'REMOTE',
    qualified: true,
    supportedRiskTiers: ['NORMAL', 'HIGH', 'CRITICAL'],
    allowedDataClasses: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
    capabilities: ['review'],
    maxContextTokens: 128000,
    independenceGroup: 'openai',
    health: 'AVAILABLE',
    recentCalls: 10,
    recentSuccessfulCalls: 9,
    observedLatencyMs: 3200,
    observedCostUsd: 0.25,
  });

  assert.equal(built.evidence.availabilityRatio, 0.9);
  assert.equal(built.evidence.semanticOutcomeUsed, false);
  assert.equal(built.evidence.authority, 'NONE');
  assert.equal(built.candidate.observedLatencyMs, 3200);
  assert.equal(built.candidate.estimatedCallCostUsd, 0.25);
  assert.equal(routingTelemetryCanUseSemanticOutcome(), false);
  assert.equal(routingTelemetryCanGrantAuthority(), false);
});

test('routing failover plan permits availability failures only and never applies runtime itself', () => {
  const decision = optimizeFhKuikaRoutingV1({
    schemaVersion: 1,
    logicalRole: 'security-reviewer',
    preferredBindingId: 'preferred',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
    requiredCapabilities: ['review'],
    requiredContextTokens: 50000,
    excludedIndependenceGroups: [],
    authority: 'NONE',
    candidates: [
      {
        bindingId: 'preferred',
        provider: 'claude',
        model: 'opus',
        locality: 'REMOTE',
        qualified: true,
        supportedRiskTiers: ['HIGH'],
        allowedDataClasses: ['INTERNAL'],
        capabilities: ['review'],
        maxContextTokens: 200000,
        independenceGroup: 'claude',
        health: 'QUOTA_EXHAUSTED',
      },
      {
        bindingId: 'fallback',
        provider: 'openai',
        model: 'gpt',
        locality: 'REMOTE',
        qualified: true,
        supportedRiskTiers: ['HIGH'],
        allowedDataClasses: ['INTERNAL'],
        capabilities: ['review'],
        maxContextTokens: 128000,
        independenceGroup: 'openai',
        health: 'AVAILABLE',
      },
    ],
  });

  const plan = buildFhKuikaRoutingFailoverPlanV1(decision);
  assert.equal(plan.selectedBindingId, 'fallback');
  assert.deepEqual(plan.eligibleBindingOrder, ['fallback']);
  assert.ok(plan.allowedFailureKinds.includes('QUOTA_EXHAUSTED'));
  assert.ok(plan.allowedFailureKinds.includes('TIMEOUT'));
  assert.equal(plan.semanticFailureFallbackAllowed, false);
  assert.equal(plan.malformedResponseFallbackAllowed, false);
  assert.equal(plan.runtimeApplicationAuthorized, false);
  assert.equal(plan.authority, 'NONE');
  assert.equal(routingFailoverPlanCanApplyRuntime(), false);
  assert.equal(routingFailoverPlanCanRetrySemanticFailure(), false);
  assert.equal(routingFailoverPlanCanGrantAuthority(), false);
});

test('routing telemetry validates bounded observed metrics', () => {
  assert.throws(
    () =>
      buildFhKuikaRoutingCandidateFromTelemetryV1({
        bindingId: 'bad',
        provider: 'x',
        model: 'y',
        locality: 'REMOTE',
        qualified: true,
        supportedRiskTiers: ['NORMAL'],
        allowedDataClasses: ['PUBLIC'],
        capabilities: [],
        maxContextTokens: 1000,
        independenceGroup: 'x',
        health: 'AVAILABLE',
        recentCalls: 1,
        recentSuccessfulCalls: 2,
      }),
    /cannot exceed/,
  );
});
