import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  createGatedInfrastructureMutationExecutor,
  infrastructureMutationExecutorCanBypassCapabilityGate,
  infrastructureMutationRequestCanChooseTargets,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const INTENT_HASH = 'b'.repeat(64);

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fh35b-infra-'));
  const store = new AuthorityCapabilityStateStore(join(root, 'authority.json'));
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const evidence = {
    schemaVersion: 1,
    intentId: 'intent-1',
    sourceRevision: REVISION,
    intentHash: INTENT_HASH,
    serviceId: 'svc-api',
    environment: 'staging',
    operation: 'RESTART',
    targetResourceIds: ['api-1'],
    ...overrides,
  };
  const calls = [];
  const adapter = {
    id: 'infra-provider',
    async execute(action) {
      calls.push(action);
      return {
        schemaVersion: 1,
        receiptId: 'receipt-1',
        intentId: action.intentId,
        operation: action.operation,
      };
    },
  };
  return { store, gate, evidence, calls, adapter };
}

function activate(store) {
  const current = store.read();
  assert.equal(
    store.write(current.generation, {
      schemaVersion: 1,
      requestedCapabilities: ['INFRASTRUCTURE_MUTATION'],
      activeCapabilities: ['INFRASTRUCTURE_MUTATION'],
    }).status,
    'WRITTEN',
  );
}

function input(evidence, overrides = {}) {
  return {
    schemaVersion: 1,
    intentId: evidence.intentId,
    sourceRevision: evidence.sourceRevision,
    intentHash: evidence.intentHash,
    ...overrides,
  };
}

function request(value) {
  return {
    schemaVersion: 1,
    activityId: 'infra-activity',
    runId: 'run-001',
    workspaceHash: 'c'.repeat(64),
    kind: 'COMMAND',
    input: typeof value === 'string' ? value : JSON.stringify(value),
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

test('FH-35B infrastructure mutation is default DENY and request cannot choose targets', async () => {
  const fx = fixture();
  const executor = createGatedInfrastructureMutationExecutor(fx.gate, fx.evidence, fx.adapter);
  const result = await executor.execute(request(input(fx.evidence)));

  assert.equal(result.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(fx.calls, []);
  assert.equal(infrastructureMutationExecutorCanBypassCapabilityGate(), false);
  assert.equal(infrastructureMutationRequestCanChooseTargets(), false);
});

test('active INFRASTRUCTURE_MUTATION delegates trusted intent operation and targets', async () => {
  for (const operation of ['RESTART', 'SCALE', 'DEPLOY', 'ROLLBACK', 'CONFIGURE']) {
    const fx = fixture({ operation, targetResourceIds: ['resource-a', 'resource-b'] });
    activate(fx.store);
    const executor = createGatedInfrastructureMutationExecutor(fx.gate, fx.evidence, fx.adapter);
    const result = await executor.execute(request(input(fx.evidence)));

    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(fx.calls.length, 1);
    assert.equal(fx.calls[0].operation, operation);
    assert.deepEqual(fx.calls[0].targetResourceIds, ['resource-a', 'resource-b']);
  }
});

test('trusted operational intent evidence validates all execution bindings', () => {
  const base = fixture();
  const invalid = [
    { schemaVersion: 2 },
    { intentId: '' },
    { serviceId: '' },
    { environment: '' },
    { environment: 'x'.repeat(129) },
    { environment: 'bad\0env' },
    { sourceRevision: 'bad' },
    { intentHash: 'bad' },
    { operation: 'DIAGNOSE' },
    { sourceRevision: 'd'.repeat(40) },
    { targetResourceIds: [] },
    { targetResourceIds: Array.from({ length: 129 }, (_, i) => 'r-' + i) },
    { targetResourceIds: ['!'] },
    { targetResourceIds: ['api-1', 'api-1'] },
  ];

  for (const patch of invalid) {
    const fx = fixture(patch);
    assert.throws(() =>
      createGatedInfrastructureMutationExecutor(base.gate, fx.evidence, base.adapter),
    );
  }
  assert.throws(() =>
    createGatedInfrastructureMutationExecutor(base.gate, base.evidence, null),
  );
  assert.throws(() =>
    createGatedInfrastructureMutationExecutor(base.gate, base.evidence, {
      id: 'provider',
      execute: null,
    }),
  );
  assert.throws(() =>
    createGatedInfrastructureMutationExecutor(base.gate, base.evidence, {
      id: '!',
      execute: async () => ({}),
    }),
  );
});

test('request binding rejects malformed input and any client-selected mutation fields', async () => {
  const fx = fixture();
  activate(fx.store);
  const executor = createGatedInfrastructureMutationExecutor(fx.gate, fx.evidence, fx.adapter);
  const cases = [
    '{',
    '[]',
    input(fx.evidence, { targetResourceIds: ['other'] }),
    input(fx.evidence, { schemaVersion: 2 }),
    input(fx.evidence, { intentId: 'intent-2' }),
    input(fx.evidence, { sourceRevision: 'd'.repeat(40) }),
    input(fx.evidence, { intentHash: 'd'.repeat(64) }),
  ];

  for (const value of cases) {
    const result = await executor.execute(request(value));
    assert.equal(result.failureKind, 'INFRASTRUCTURE_MUTATION_INPUT_INVALID');
  }
  assert.deepEqual(fx.calls, []);
});

test('provider failures and forged receipts fail closed', async () => {
  const fx = fixture();
  activate(fx.store);

  const throwing = createGatedInfrastructureMutationExecutor(fx.gate, fx.evidence, {
    id: 'throwing-provider',
    async execute() {
      throw new Error('provider failed');
    },
  });
  assert.equal(
    (await throwing.execute(request(input(fx.evidence)))).failureKind,
    'INFRASTRUCTURE_MUTATION_FAILED',
  );

  for (const receipt of [
    null,
    { schemaVersion: 2 },
    { schemaVersion: 1, receiptId: '!', intentId: 'intent-1', operation: 'RESTART' },
    { schemaVersion: 1, receiptId: 'receipt-1', intentId: 'intent-2', operation: 'RESTART' },
    { schemaVersion: 1, receiptId: 'receipt-1', intentId: 'intent-1', operation: 'SCALE' },
  ]) {
    const executor = createGatedInfrastructureMutationExecutor(fx.gate, fx.evidence, {
      id: 'bad-receipt-provider',
      async execute() {
        return receipt;
      },
    });
    assert.equal(
      (await executor.execute(request(input(fx.evidence)))).failureKind,
      'INFRASTRUCTURE_MUTATION_FAILED',
    );
  }
});
