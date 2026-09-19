import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProviderCircuitBreaker,
  buildProviderHealthSnapshot,
  providerCircuitCanChangeAuthority,
  providerCircuitCanTripOnSemanticFailure,
} from '../dist/index.js';

test('availability failures deterministically open the circuit at the configured threshold', () => {
  const circuit = new ProviderCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 1_000,
  });

  assert.equal(circuit.beforeRequest(0).allowed, true);

  const first = circuit.recordFailure('provider_unavailable', 10);
  assert.equal(first.snapshot.state, 'CLOSED');
  assert.equal(first.snapshot.consecutiveAvailabilityFailures, 1);

  const second = circuit.recordFailure('transport_failure', 20);
  assert.equal(second.snapshot.state, 'OPEN');
  assert.equal(second.snapshot.openedAtMs, 20);
  assert.equal(second.snapshot.nextProbeAtMs, 1_020);
  assert.deepEqual(second.transition, {
    from: 'CLOSED',
    to: 'OPEN',
    reason: 'availability failure threshold reached: transport_failure',
  });

  const blocked = circuit.beforeRequest(500);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'CIRCUIT_OPEN');
});

test('open circuit enters HALF_OPEN at the deterministic probe boundary and success closes it', () => {
  const circuit = new ProviderCircuitBreaker({
    failureThreshold: 1,
    openDurationMs: 1_000,
  });

  circuit.recordFailure('provider_unavailable', 100);

  assert.equal(circuit.beforeRequest(1_099).allowed, false);
  const probe = circuit.beforeRequest(1_100);
  assert.equal(probe.allowed, true);
  assert.equal(probe.reason, 'HALF_OPEN_PROBE');
  assert.equal(probe.snapshot.state, 'HALF_OPEN');
  assert.deepEqual(probe.transition, {
    from: 'OPEN',
    to: 'HALF_OPEN',
    reason: 'probe window reached',
  });

  const recovered = circuit.recordSuccess(1_101);
  assert.equal(recovered.snapshot.state, 'CLOSED');
  assert.equal(recovered.snapshot.consecutiveAvailabilityFailures, 0);
  assert.deepEqual(recovered.transition, {
    from: 'HALF_OPEN',
    to: 'CLOSED',
    reason: 'provider availability recovered',
  });
});

test('failed HALF_OPEN probe immediately reopens the circuit', () => {
  const circuit = new ProviderCircuitBreaker({
    failureThreshold: 3,
    openDurationMs: 500,
  });

  circuit.recordFailure('provider_unavailable', 1);
  circuit.recordFailure('provider_unavailable', 2);
  circuit.recordFailure('provider_unavailable', 3);

  assert.equal(circuit.beforeRequest(503).snapshot.state, 'HALF_OPEN');

  const reopened = circuit.recordFailure('rate_limited', 504);
  assert.equal(reopened.snapshot.state, 'OPEN');
  assert.equal(reopened.snapshot.nextProbeAtMs, 1_004);
  assert.equal(reopened.transition?.from, 'HALF_OPEN');
  assert.equal(reopened.transition?.to, 'OPEN');
});

test('retry-after extends but never shortens the base cooldown', () => {
  const longRetry = new ProviderCircuitBreaker({
    failureThreshold: 1,
    openDurationMs: 1_000,
  });
  longRetry.recordFailure('quota_exhausted', 100, 5_000);
  assert.equal(longRetry.snapshot().nextProbeAtMs, 5_100);

  const shortRetry = new ProviderCircuitBreaker({
    failureThreshold: 1,
    openDurationMs: 1_000,
  });
  shortRetry.recordFailure('rate_limited', 100, 100);
  assert.equal(shortRetry.snapshot().nextProbeAtMs, 1_100);
});

test('semantic and malformed failures never trip the availability circuit', () => {
  for (const kind of ['semantic_failure', 'malformed_output']) {
    const circuit = new ProviderCircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 1_000,
    });

    const update = circuit.recordFailure(kind, 10);
    assert.equal(update.snapshot.state, 'CLOSED');
    assert.equal(update.snapshot.consecutiveAvailabilityFailures, 0);
    assert.equal(update.transition, undefined);
  }

  assert.equal(providerCircuitCanTripOnSemanticFailure(), false);
  assert.equal(providerCircuitCanChangeAuthority(), false);
});

test('a non-availability outcome clears prior availability failure streak', () => {
  const circuit = new ProviderCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 1_000,
  });

  circuit.recordFailure('provider_unavailable', 1);
  assert.equal(circuit.snapshot().consecutiveAvailabilityFailures, 1);

  circuit.recordFailure('semantic_failure', 2);
  assert.equal(circuit.snapshot().state, 'CLOSED');
  assert.equal(circuit.snapshot().consecutiveAvailabilityFailures, 0);
});

test('provider health snapshot is metadata-only and includes circuit state', () => {
  const circuit = new ProviderCircuitBreaker({
    failureThreshold: 2,
    openDurationMs: 1_000,
  });
  circuit.recordFailure('provider_unavailable', 1);

  assert.deepEqual(
    buildProviderHealthSnapshot(
      'qwen-local',
      { available: false, detail: 'connection refused' },
      circuit,
    ),
    {
      providerId: 'qwen-local',
      available: false,
      detail: 'connection refused',
      circuit: {
        state: 'CLOSED',
        consecutiveAvailabilityFailures: 1,
      },
    },
  );
});

test('invalid circuit policies and clock inputs fail closed', () => {
  assert.throws(
    () => new ProviderCircuitBreaker({ failureThreshold: 0, openDurationMs: 100 }),
    /failureThreshold/,
  );
  assert.throws(
    () => new ProviderCircuitBreaker({ failureThreshold: 1, openDurationMs: 0 }),
    /openDurationMs/,
  );

  const circuit = new ProviderCircuitBreaker({
    failureThreshold: 1,
    openDurationMs: 100,
  });
  assert.throws(() => circuit.beforeRequest(-1), /nowMs/);
  assert.throws(() => circuit.recordFailure('quota_exhausted', 1, -1), /retryAfterMs/);
});
