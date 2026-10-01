import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createFhKuikaConnectorInvocationRequestV1 } from '@freehighlander/contracts';
import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  FhKuikaConnectorInvocationRuntime,
  connectorInvocationRuntimeCanGrantAuthority,
  connectorInvocationRuntimeCanPersistRawSecrets,
  connectorInvocationRuntimeCanTrustCachedPermissions,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const REPOSITORY = 'owner/repo';
const PAYLOAD = '{"operation":"apply"}';

function setup(resolveConnector, activeCapabilities = []) {
  const directory = mkdtempSync(join(tmpdir(), 'fh-kuika-connector-runtime-'));
  const store = new AuthorityCapabilityStateStore(join(directory, 'authority.json'));
  if (activeCapabilities.length > 0) {
    store.write(0, {
      schemaVersion: 1,
      requestedCapabilities: activeCapabilities,
      activeCapabilities,
    });
  }
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const runtime = new FhKuikaConnectorInvocationRuntime({
    repository: REPOSITORY,
    revision: REVISION,
    gate,
    resolveConnector,
  });
  return { runtime, store, gate };
}

function trusted(overrides = {}) {
  return {
    id: 'kubernetes-mcp',
    enabled: true,
    capabilities: [{ id: 'cluster.write', mutationCapability: 'INFRASTRUCTURE_MUTATION' }],
    filesystemScopes: ['workspace-readonly'],
    networkDestinations: ['cluster.internal'],
    secretHandleRefs: ['secret:kubernetes/kubeconfig'],
    roleAllowlist: ['operations-agent'],
    ...overrides,
  };
}

function request(overrides = {}) {
  return createFhKuikaConnectorInvocationRequestV1({
    invocationId: 'invoke-1',
    connectorId: 'kubernetes-mcp',
    capabilityId: 'cluster.write',
    repository: REPOSITORY,
    exactRevision: REVISION,
    role: 'operations-agent',
    filesystemScopes: ['workspace-readonly'],
    networkDestinations: ['cluster.internal'],
    secretHandleRefs: ['secret:kubernetes/kubeconfig'],
    payloadDigest: createHash('sha256').update(PAYLOAD, 'utf8').digest('hex'),
    ...overrides,
  });
}

function activity(input = PAYLOAD) {
  return {
    schemaVersion: 1,
    activityId: 'activity-1',
    runId: 'run-1',
    workspaceHash: 'b'.repeat(64),
    kind: 'COMMAND',
    input,
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

function delegate(calls) {
  return {
    id: 'connector-side-effect',
    async execute(value) {
      calls.push(value.activityId);
      return { status: 'SUCCEEDED', output: 'ok' };
    },
  };
}

test('connector invocation revalidates trusted registry on every call', async () => {
  let current = trusted({ capabilities: [{ id: 'cluster.read', mutationCapability: null }] });
  let resolves = 0;
  const { runtime } = setup(() => {
    resolves += 1;
    return current;
  });
  const calls = [];
  const executor = runtime.bind(
    request({
      capabilityId: 'cluster.read',
      filesystemScopes: [],
      networkDestinations: [],
      secretHandleRefs: [],
    }),
    delegate(calls),
  );

  assert.equal((await executor.execute(activity())).status, 'SUCCEEDED');
  current = { ...current, enabled: false };
  const denied = await executor.execute({ ...activity(), activityId: 'activity-2' });
  assert.equal(denied.failureKind, 'KUIKA_CONNECTOR_DISABLED_OR_MISSING');
  assert.equal(resolves, 2);
  assert.deepEqual(calls, ['activity-1']);
});

test('missing connector and binding digest fail closed before delegate execution', async () => {
  let resolves = 0;
  const { runtime } = setup(() => {
    resolves += 1;
    return null;
  });
  const calls = [];
  const executor = runtime.bind(request(), delegate(calls));

  const bindingDenied = await executor.execute(activity('different'));
  assert.equal(bindingDenied.failureKind, 'KUIKA_CONNECTOR_BINDING_INVALID');
  assert.equal(resolves, 0);

  const missing = await executor.execute(activity());
  assert.equal(missing.failureKind, 'KUIKA_CONNECTOR_DISABLED_OR_MISSING');
  assert.equal(resolves, 1);
  assert.deepEqual(calls, []);
});

test('capability role scope network and secret permissions are revalidated', async () => {
  const cases = [
    [trusted({ capabilities: [] }), request(), 'capability'],
    [trusted(), request({ role: 'other-role' }), 'role'],
    [trusted(), request({ filesystemScopes: ['other-scope'] }), 'filesystem'],
    [trusted(), request({ networkDestinations: ['other.example'] }), 'network'],
    [trusted(), request({ secretHandleRefs: ['secret:other/ref'] }), 'secret'],
  ];

  for (const [connector, invocation] of cases) {
    const { runtime } = setup(() => connector);
    const outcome = await runtime.bind(invocation, delegate([])).execute(activity());
    assert.equal(outcome.failureKind, 'KUIKA_CONNECTOR_PERMISSION_DENIED');
  }
});

test('mutation-capable connector call passes through Core capability gate and observes revocation', async () => {
  const connector = trusted();
  const { runtime, store } = setup(() => connector, ['INFRASTRUCTURE_MUTATION']);
  const calls = [];
  const executor = runtime.bind(request(), delegate(calls));

  assert.equal((await executor.execute(activity())).status, 'SUCCEEDED');
  const current = store.read();
  store.write(current.generation, {
    schemaVersion: 1,
    requestedCapabilities: current.state.requestedCapabilities,
    activeCapabilities: [],
  });

  const denied = await executor.execute({ ...activity(), activityId: 'activity-2' });
  assert.equal(denied.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(calls, ['activity-1']);
  assert.equal(connectorInvocationRuntimeCanGrantAuthority(), false);
  assert.equal(connectorInvocationRuntimeCanTrustCachedPermissions(), false);
  assert.equal(connectorInvocationRuntimeCanPersistRawSecrets(), false);
});

test('constructor and binding identity are exact-bound', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fh-kuika-connector-runtime-invalid-'));
  const store = new AuthorityCapabilityStateStore(join(directory, 'authority.json'));
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });

  assert.throws(
    () =>
      new FhKuikaConnectorInvocationRuntime({
        repository: 'bad',
        revision: REVISION,
        gate,
        resolveConnector: () => trusted(),
      }),
    /owner\/name/,
  );
  assert.throws(
    () =>
      new FhKuikaConnectorInvocationRuntime({
        repository: REPOSITORY,
        revision: 'bad',
        gate,
        resolveConnector: () => trusted(),
      }),
    /40-character git SHA/,
  );
  assert.throws(
    () =>
      new FhKuikaConnectorInvocationRuntime({
        repository: REPOSITORY,
        revision: REVISION,
        gate,
        resolveConnector: null,
      }),
    /resolveConnector/,
  );

  const { runtime } = setup(() => trusted());
  assert.throws(
    () => runtime.bind(request({ repository: 'other/repo' }), delegate([])),
    /repository does not match/,
  );
  assert.throws(
    () => runtime.bind(request({ exactRevision: 'b'.repeat(40) }), delegate([])),
    /revision is stale/,
  );
  assert.throws(() => runtime.bind(request(), null), /delegate executor is required/);
  assert.throws(
    () => runtime.bind(request(), { id: 'x', async execute() {} }),
    /bounded identifier/,
  );
});

test('malformed trusted registry state fails closed', async () => {
  const cases = [
    [trusted({ id: 'other' }), /id does not match/],
    [trusted({ capabilities: [{ id: 'x', mutationCapability: null }] }), /capability id/],
    [
      trusted({ capabilities: [{ id: 'cluster.write', mutationCapability: 'UNKNOWN' }] }),
      /mutation capability is unknown/,
    ],
    [trusted({ filesystemScopes: ['bad\nvalue'] }), /boundary/],
    [trusted({ secretHandleRefs: ['raw-secret'] }), /secret references/],
  ];

  for (const [connector, pattern] of cases) {
    const { runtime } = setup(() => connector);
    await assert.rejects(() => runtime.bind(request(), delegate([])).execute(activity()), pattern);
  }
});
