import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaRoutingSimulationRequestV1,
  evaluateFhKuikaRoutingWithTelemetryV1,
  projectFhKuikaRoutingTelemetryV1,
  routingFailoverBridgeCanApply,
  routingFailoverBridgeCanUseSemanticFailure,
  routingTelemetryProjectionCanInferAvailabilityFromHistory,
  routingTelemetryProjectionCanInvokeModel,
} from '../dist/index.js';

const aggregate = {
  logicalRole: 'security-reviewer',
  provider: 'claude-cli',
  model: 'opus',
  effort: 'medium',
  calls: 2,
  totalTokens: 2000,
  estimatedCostUsd: 1.2,
  actualCostUsd: 1,
  averageLatencyMs: 5000,
  retries: 0,
  fallbacks: 0,
};

const fallbackState = {
  logicalRole: 'security-reviewer',
  observedAt: '2026-09-27T20:00:00.000Z',
  state: 'FALLBACK_ACTIVE',
  preferredBindingId: 'preferred-review',
  preferredModel: 'opus',
  activeBindingId: 'fallback-review',
  activeModel: 'gpt',
  providerId: 'claude-cli',
  failureKind: 'quota_exhausted',
  nextCheckAt: '2026-09-27T21:00:00.000Z',
  returnPolicy: 'ASK_BEFORE_RETURN',
};

test('routing telemetry enriches cost/latency and uses current failover state for availability', () => {
  const request = createFhKuikaRoutingSimulationRequestV1();
  const projection = projectFhKuikaRoutingTelemetryV1(
    request.logicalRole,
    request.candidates,
    [aggregate],
    [fallbackState],
  );

  const preferred = projection.candidates.find(
    (candidate) => candidate.bindingId === 'preferred-review',
  );
  const fallback = projection.candidates.find(
    (candidate) => candidate.bindingId === 'fallback-review',
  );

  assert.ok(preferred);
  assert.ok(fallback);
  assert.equal(preferred.estimatedCallCostUsd, 0.5);
  assert.equal(preferred.observedLatencyMs, 5000);
  assert.equal(preferred.health, 'QUOTA_EXHAUSTED');
  assert.equal(preferred.retryAt, '2026-09-27T21:00:00.000Z');
  assert.equal(fallback.health, 'AVAILABLE');
  assert.equal(projection.providerStateApplied, true);
  assert.equal(projection.authority, 'NONE');
});

test('telemetry-backed routing selects eligible fallback but never applies it', () => {
  const request = createFhKuikaRoutingSimulationRequestV1();
  const result = evaluateFhKuikaRoutingWithTelemetryV1(request, [aggregate], [fallbackState]);

  assert.equal(result.decision.selectedBindingId, 'fallback-review');
  assert.equal(result.decision.semanticOutcomeConsidered, false);
  assert.equal(result.decision.executionAuthorized, false);

  assert.equal(result.bridge.preferredBindingId, 'preferred-review');
  assert.equal(result.bridge.currentActiveBindingId, 'fallback-review');
  assert.equal(result.bridge.selectedBindingId, 'fallback-review');
  assert.equal(result.bridge.selectionDiffersFromActive, false);
  assert.equal(result.bridge.semanticFailureTriggerAllowed, false);
  assert.equal(result.bridge.runtimeMutationPerformed, false);
  assert.equal(result.bridge.applyAuthorized, false);
  assert.deepEqual(result.bridge.allowedFailureTriggers, [
    'QUOTA_EXHAUSTED',
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
    'TRANSPORT',
    'AUTH',
  ]);
  assert.equal(result.authority, 'NONE');

  assert.equal(routingFailoverBridgeCanApply(), false);
  assert.equal(routingFailoverBridgeCanUseSemanticFailure(), false);
});

test('historical telemetry cannot invent current provider availability', () => {
  const request = createFhKuikaRoutingSimulationRequestV1({
    preferredHealth: 'UNKNOWN',
  });
  const projection = projectFhKuikaRoutingTelemetryV1(
    request.logicalRole,
    request.candidates,
    [aggregate],
    [],
  );
  const preferred = projection.candidates.find(
    (candidate) => candidate.bindingId === 'preferred-review',
  );

  assert.ok(preferred);
  assert.equal(preferred.health, 'UNKNOWN');
  assert.equal(projection.providerStateApplied, false);
  assert.equal(routingTelemetryProjectionCanInferAvailabilityFromHistory(), false);
  assert.equal(routingTelemetryProjectionCanInvokeModel(), false);
});
