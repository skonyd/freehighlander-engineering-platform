import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  createGatedReleaseMutationExecutor,
  releaseMutationExecutorCanBypassCapabilityGate,
  releaseMutationExecutorCanTreatReadinessAsAuthority,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const SNAPSHOT_HASH = 'b'.repeat(64);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'fh34b-release-'));
  const store = new AuthorityCapabilityStateStore(join(root, 'authority.json'));
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const evidence = {
    schemaVersion: 1,
    candidateId: 'candidate-1',
    sourceRevision: REVISION,
    snapshotHash: SNAPSHOT_HASH,
    status: 'READY',
    rollbackVerified: true,
  };
  const calls = [];
  const adapter = {
    id: 'release-provider',
    async execute(action) {
      calls.push(action);
      return {
        schemaVersion: 1,
        receiptId: 'receipt-1',
        operation: action.operation,
        target: action.target,
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
      requestedCapabilities: ['RELEASE_DEPLOY'],
      activeCapabilities: ['RELEASE_DEPLOY'],
    }).status,
    'WRITTEN',
  );
}

function action(overrides = {}) {
  return {
    schemaVersion: 1,
    operation: 'DEPLOY',
    candidateId: 'candidate-1',
    sourceRevision: REVISION,
    snapshotHash: SNAPSHOT_HASH,
    target: 'staging',
    ...overrides,
  };
}

function request(input) {
  return {
    schemaVersion: 1,
    activityId: 'release-activity',
    runId: 'run-001',
    workspaceHash: 'c'.repeat(64),
    kind: 'COMMAND',
    input: typeof input === 'string' ? input : JSON.stringify(input),
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

test('FH-34B release mutation remains default DENY and readiness is not authority', async () => {
  const fx = fixture();
  const executor = createGatedReleaseMutationExecutor(fx.gate, fx.evidence, fx.adapter);
  const result = await executor.execute(request(action()));

  assert.equal(result.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(fx.calls, []);
  assert.equal(releaseMutationExecutorCanBypassCapabilityGate(), false);
  assert.equal(releaseMutationExecutorCanTreatReadinessAsAuthority(), false);
});

test('active RELEASE_DEPLOY delegates all bounded release operations', async () => {
  for (const operation of ['PUBLISH_TAG', 'PUBLISH_RELEASE', 'DEPLOY', 'ROLLBACK']) {
    const fx = fixture();
    activate(fx.store);
    const executor = createGatedReleaseMutationExecutor(fx.gate, fx.evidence, fx.adapter);
    const result = await executor.execute(request(action({ operation, target: 'target-' + operation })));

    assert.equal(result.status, 'SUCCEEDED');
    const receipt = JSON.parse(result.output);
    assert.equal(receipt.operation, operation);
    assert.equal(receipt.target, 'target-' + operation);
    assert.equal(fx.calls.length, 1);
  }
});

test('rollback additionally requires verified rollback evidence', async () => {
  const fx = fixture();
  activate(fx.store);
  const executor = createGatedReleaseMutationExecutor(
    fx.gate,
    { ...fx.evidence, rollbackVerified: false },
    fx.adapter,
  );
  const result = await executor.execute(request(action({ operation: 'ROLLBACK' })));

  assert.equal(result.failureKind, 'RELEASE_ROLLBACK_NOT_VERIFIED');
  assert.deepEqual(fx.calls, []);
});

test('trusted evidence must be ready exact-bound and adapter must be valid', () => {
  const fx = fixture();

  for (const evidence of [
    { ...fx.evidence, schemaVersion: 2 },
    { ...fx.evidence, status: 'BLOCKED' },
    { ...fx.evidence, candidateId: '' },
    { ...fx.evidence, sourceRevision: 'bad' },
    { ...fx.evidence, snapshotHash: 'bad' },
    { ...fx.evidence, sourceRevision: 'd'.repeat(40) },
  ]) {
    assert.throws(() => createGatedReleaseMutationExecutor(fx.gate, evidence, fx.adapter));
  }

  assert.throws(() => createGatedReleaseMutationExecutor(fx.gate, fx.evidence, null));
  assert.throws(() =>
    createGatedReleaseMutationExecutor(fx.gate, fx.evidence, { id: 'x', execute: null }),
  );
  assert.throws(() =>
    createGatedReleaseMutationExecutor(fx.gate, fx.evidence, { id: '!', execute: async () => ({}) }),
  );
});

test('malformed or stale action input fails before provider delegation', async () => {
  const fx = fixture();
  activate(fx.store);
  const executor = createGatedReleaseMutationExecutor(fx.gate, fx.evidence, fx.adapter);
  const cases = [
    '{',
    '[]',
    action({ unknown: true }),
    action({ schemaVersion: 2 }),
    action({ operation: 'DELETE' }),
    action({ candidateId: 3 }),
    action({ sourceRevision: 3 }),
    action({ snapshotHash: 3 }),
    action({ target: 3 }),
    action({ candidateId: 'x' }),
    action({ sourceRevision: 'bad' }),
    action({ snapshotHash: 'bad' }),
    action({ target: '' }),
    action({ target: 'x'.repeat(257) }),
    action({ target: 'bad\0target' }),
    action({ candidateId: 'candidate-2' }),
    action({ sourceRevision: 'd'.repeat(40) }),
    action({ snapshotHash: 'd'.repeat(64) }),
  ];

  for (const input of cases) {
    const result = await executor.execute(request(input));
    assert.equal(result.failureKind, 'RELEASE_MUTATION_INPUT_INVALID');
  }
  assert.deepEqual(fx.calls, []);
});

test('provider failure and malformed receipts fail closed', async () => {
  const fx = fixture();
  activate(fx.store);

  const throwing = createGatedReleaseMutationExecutor(fx.gate, fx.evidence, {
    id: 'throwing-provider',
    async execute() {
      throw new Error('provider failed');
    },
  });
  assert.equal(
    (await throwing.execute(request(action()))).failureKind,
    'RELEASE_MUTATION_FAILED',
  );

  for (const receipt of [
    null,
    { schemaVersion: 2 },
    { schemaVersion: 1, receiptId: '!', operation: 'DEPLOY', target: 'staging' },
    { schemaVersion: 1, receiptId: 'receipt-1', operation: 'ROLLBACK', target: 'staging' },
    { schemaVersion: 1, receiptId: 'receipt-1', operation: 'DEPLOY', target: 'other' },
  ]) {
    const executor = createGatedReleaseMutationExecutor(fx.gate, fx.evidence, {
      id: 'bad-receipt-provider',
      async execute() {
        return receipt;
      },
    });
    assert.equal(
      (await executor.execute(request(action()))).failureKind,
      'RELEASE_MUTATION_FAILED',
    );
  }
});
