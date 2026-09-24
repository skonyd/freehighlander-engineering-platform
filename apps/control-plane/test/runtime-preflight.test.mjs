import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateRuntimePreflight,
  runtimePreflightCanGrantAuthority,
  runtimePreflightCanInvokeProvider,
  runtimePreflightCanResolveSecretValue,
} from '../dist/index.js';

function binding(overrides = {}) {
  return {
    bindingId: 'binding-001',
    logicalRole: 'test-reviewer',
    providerId: 'provider-001',
    modelId: 'model-001',
    bindingExists: true,
    modelEligible: true,
    effort: 'medium',
    effortSupported: true,
    requiredCapabilities: ['reasoning_effort'],
    availableCapabilities: ['reasoning_effort', 'usage_token_breakdown'],
    independenceGroup: 'reviewer-group-a',
    requiredIndependenceGroup: 'reviewer-group-a',
    providerAvailable: true,
    circuitState: 'CLOSED',
    endpointRequired: false,
    endpointHealthy: null,
    requiredSecretHandleIds: ['provider.api'],
    resolvableSecretHandleIds: ['provider.api'],
    ...overrides,
  };
}

test('runtime preflight passes exact known-good evidence without invoking anything', () => {
  const result = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [binding()],
  });

  assert.deepEqual(result, {
    status: 'PASS',
    failures: [],
    checkedBindingIds: ['binding-001'],
    authority: 'NONE',
    invocationAuthorized: false,
  });
});

test('runtime preflight deterministically reports every blocking condition', () => {
  const result = evaluateRuntimePreflight({
    runSnapshotBuildable: false,
    bindings: [
      binding({
        bindingExists: false,
        modelEligible: false,
        effortSupported: false,
        availableCapabilities: [],
        independenceGroup: 'reviewer-group-b',
        providerAvailable: false,
        circuitState: 'OPEN',
        endpointRequired: true,
        endpointHealthy: false,
        resolvableSecretHandleIds: [],
      }),
    ],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(
    result.failures.map((failure) => failure.code),
    [
      'RUN_SNAPSHOT_UNBUILDABLE',
      'BINDING_MISSING',
      'CAPABILITY_MISSING',
      'CIRCUIT_OPEN',
      'EFFORT_UNSUPPORTED',
      'ENDPOINT_UNHEALTHY',
      'INDEPENDENCE_MISMATCH',
      'MODEL_INELIGIBLE',
      'PROVIDER_UNAVAILABLE',
      'SECRET_UNRESOLVABLE',
    ],
  );
  assert.equal(
    result.failures.every((failure) => failure.detail.length > 0),
    true,
  );
});

test('requested effort fails closed when support is unknown but omitted effort does not', () => {
  const unknownSupport = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [binding({ effortSupported: null })],
  });
  assert.equal(unknownSupport.status, 'BLOCKED');
  assert.equal(unknownSupport.failures[0]?.code, 'EFFORT_UNSUPPORTED');

  const noEffort = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [binding({ effort: null, effortSupported: null })],
  });
  assert.equal(noEffort.status, 'PASS');
});

test('required endpoint must be positively healthy while non-required endpoints stay null', () => {
  const unknownEndpoint = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [
      binding({
        endpointRequired: true,
        endpointHealthy: null,
      }),
    ],
  });
  assert.equal(unknownEndpoint.status, 'BLOCKED');
  assert.equal(unknownEndpoint.failures[0]?.code, 'ENDPOINT_UNHEALTHY');

  assert.throws(() =>
    evaluateRuntimePreflight({
      runSnapshotBuildable: true,
      bindings: [binding({ endpointRequired: false, endpointHealthy: true })],
    }),
  );
});

test('HALF_OPEN circuit can be preflight-eligible but OPEN circuit blocks', () => {
  const halfOpen = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [binding({ circuitState: 'HALF_OPEN' })],
  });
  assert.equal(halfOpen.status, 'PASS');

  const open = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [binding({ circuitState: 'OPEN' })],
  });
  assert.equal(open.status, 'BLOCKED');
  assert.equal(open.failures[0]?.code, 'CIRCUIT_OPEN');
});

test('multiple bindings are checked deterministically and duplicate binding ids fail closed', () => {
  const result = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [
      binding({
        bindingId: 'binding-002',
        providerId: 'provider-002',
        modelId: 'model-002',
      }),
      binding(),
    ],
  });
  assert.deepEqual(result.checkedBindingIds, ['binding-001', 'binding-002']);

  assert.throws(
    () =>
      evaluateRuntimePreflight({
        runSnapshotBuildable: true,
        bindings: [binding(), binding()],
      }),
    /duplicate runtime preflight bindingId/,
  );
});

test('preflight binding input rejects malformed identifiers circuit values and duplicate evidence ids', () => {
  const malformed = [
    binding({ bindingId: 'x' }),
    binding({ logicalRole: 'x' }),
    binding({ providerId: 'x' }),
    binding({ modelId: 'x' }),
    binding({ effort: 'x' }),
    binding({ independenceGroup: 'x' }),
    binding({ requiredIndependenceGroup: 'x' }),
    binding({ circuitState: 'UNKNOWN' }),
    binding({ requiredCapabilities: ['capability-a', 'capability-a'] }),
    binding({ availableCapabilities: ['capability-a', 'capability-a'] }),
    binding({ requiredSecretHandleIds: ['provider.api', 'provider.api'] }),
    binding({ resolvableSecretHandleIds: ['provider.api', 'provider.api'] }),
    binding({ requiredCapabilities: ['x'] }),
  ];

  for (const value of malformed) {
    assert.throws(() =>
      evaluateRuntimePreflight({
        runSnapshotBuildable: true,
        bindings: [value],
      }),
    );
  }
});

test('preflight can report missing secret separately from provider authentication behavior', () => {
  const result = evaluateRuntimePreflight({
    runSnapshotBuildable: true,
    bindings: [
      binding({
        requiredSecretHandleIds: ['provider.api', 'tool.auth'],
        resolvableSecretHandleIds: ['provider.api'],
      }),
    ],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(
    result.failures.map((failure) => [failure.code, failure.detail]),
    [['SECRET_UNRESOLVABLE', 'required secret handle is not resolvable: tool.auth']],
  );
});

test('runtime preflight is side-effect-free and authority-neutral by contract', () => {
  assert.equal(runtimePreflightCanInvokeProvider(), false);
  assert.equal(runtimePreflightCanResolveSecretValue(), false);
  assert.equal(runtimePreflightCanGrantAuthority(), false);
});
