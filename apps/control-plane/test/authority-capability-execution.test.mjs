import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  capabilityExecutionGateCanBypassActiveState,
  capabilityExecutionGateCanBypassSystemPolicy,
  createAutomaticRemediationGatedExecutor,
  createCapabilityGatedActivityExecutor,
  createGitWriteGatedExecutor,
  createInfrastructureMutationGatedExecutor,
  createReleaseDeployGatedExecutor,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const DRIFTED_REVISION = 'b'.repeat(40);

function createStateStore() {
  const directory = mkdtempSync(join(tmpdir(), 'fh-execution-gate-'));
  return new AuthorityCapabilityStateStore(join(directory, 'authority.json'));
}

function activate(store, capabilities) {
  const current = store.read();
  const write = store.write(current.generation, {
    schemaVersion: 1,
    requestedCapabilities: capabilities,
    activeCapabilities: capabilities,
  });
  assert.equal(write.status, 'WRITTEN');
  return write.snapshot;
}

function deactivateAll(store) {
  const current = store.read();
  const write = store.write(current.generation, {
    schemaVersion: 1,
    requestedCapabilities: current.state.requestedCapabilities,
    activeCapabilities: [],
  });
  assert.equal(write.status, 'WRITTEN');
  return write.snapshot;
}

function request() {
  return {
    schemaVersion: 1,
    activityId: 'activity-001',
    runId: 'run-001',
    workspaceHash: 'c'.repeat(64),
    kind: 'COMMAND',
    input: '{}',
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

function delegate(callLog) {
  return {
    id: 'side-effect-v1',
    async execute(activity) {
      callLog.push(activity.activityId);
      return { status: 'SUCCEEDED', output: 'done' };
    },
  };
}

test('execution gate denies default-DENY capability before delegate execution', async () => {
  const store = createStateStore();
  const calls = [];
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const executor = createGitWriteGatedExecutor(gate, delegate(calls));

  const outcome = await executor.execute(request());
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(calls, []);

  const decision = gate.check('GIT_WRITE');
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, ['capability is not active']);
  assert.match(decision.policyHash, /^[a-f0-9]{64}$/);
  assert.equal(decision.authority, 'CONTROL_PLANE_POLICY_GATED');
});

test('active capability with current policy and exact revision reaches the delegate', async () => {
  const store = createStateStore();
  activate(store, ['GIT_WRITE']);
  const calls = [];
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const executor = createGitWriteGatedExecutor(gate, delegate(calls));

  const decision = gate.check('GIT_WRITE');
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, []);

  const outcome = await executor.execute(request());
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(outcome.output, 'done');
  assert.deepEqual(calls, ['activity-001']);
});

test('revocation is re-read immediately before every side effect', async () => {
  const store = createStateStore();
  activate(store, ['GIT_WRITE']);
  const calls = [];
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const executor = createGitWriteGatedExecutor(gate, delegate(calls));

  assert.equal((await executor.execute(request())).status, 'SUCCEEDED');
  deactivateAll(store);

  const denied = await executor.execute({ ...request(), activityId: 'activity-002' });
  assert.equal(denied.status, 'FAILED');
  assert.equal(denied.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(calls, ['activity-001']);
});

test('exact revision drift fails closed before delegate execution', async () => {
  const store = createStateStore();
  activate(store, ['GIT_WRITE']);
  const calls = [];
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => DRIFTED_REVISION,
  });
  const executor = createGitWriteGatedExecutor(gate, delegate(calls));

  const decision = gate.check('GIT_WRITE');
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, ['exact revision drifted']);
  assert.equal(decision.observedRevision, DRIFTED_REVISION);

  const outcome = await executor.execute(request());
  assert.equal(outcome.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.deepEqual(calls, []);
});

test('four critical capability wrappers enforce independent active state', async () => {
  const store = createStateStore();
  activate(store, ['RELEASE_DEPLOY', 'AUTOMATIC_REMEDIATION']);
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });

  const cases = [
    ['GIT_WRITE', createGitWriteGatedExecutor, false],
    ['RELEASE_DEPLOY', createReleaseDeployGatedExecutor, true],
    ['INFRASTRUCTURE_MUTATION', createInfrastructureMutationGatedExecutor, false],
    ['AUTOMATIC_REMEDIATION', createAutomaticRemediationGatedExecutor, true],
  ];

  for (const [capability, factory, allowed] of cases) {
    const calls = [];
    const executor = factory(gate, delegate(calls));
    const outcome = await executor.execute({
      ...request(),
      activityId: 'activity-' + capability.toLowerCase(),
    });
    assert.equal(outcome.status, allowed ? 'SUCCEEDED' : 'FAILED');
    assert.equal(calls.length, allowed ? 1 : 0);
  }
});

test('generic wrapper validates capability delegate and trusted revision inputs', () => {
  const store = createStateStore();
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });

  assert.throws(
    () =>
      new AuthorityCapabilityExecutionGate({
        stateStore: store,
        expectedRevision: 'bad',
        observeRevision: () => REVISION,
      }),
    /expectedRevision must be a 40-character git SHA/,
  );
  assert.throws(
    () =>
      new AuthorityCapabilityExecutionGate({
        stateStore: store,
        expectedRevision: REVISION,
        observeRevision: null,
      }),
    /observeRevision must be a function/,
  );
  assert.throws(
    () => createCapabilityGatedActivityExecutor('UNKNOWN_CAPABILITY', gate, delegate([])),
    /unknown authority capability/,
  );
  assert.throws(
    () => createCapabilityGatedActivityExecutor('GIT_WRITE', gate, { id: 'x', execute() {} }),
    /bounded identifier/,
  );
  assert.throws(
    () => createCapabilityGatedActivityExecutor('GIT_WRITE', gate, null),
    /delegate executor is required/,
  );

  const malformedObserved = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => 'bad',
  });
  assert.throws(
    () => malformedObserved.check('GIT_WRITE'),
    /observedRevision must be a 40-character git SHA/,
  );

  assert.equal(capabilityExecutionGateCanBypassActiveState(), false);
  assert.equal(capabilityExecutionGateCanBypassSystemPolicy(), false);
});

test('wrapper propagates delegate failures only after the capability gate allows execution', async () => {
  const store = createStateStore();
  activate(store, ['GIT_WRITE']);
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });
  const executor = createGitWriteGatedExecutor(gate, {
    id: 'failing-side-effect-v1',
    async execute() {
      return { status: 'FAILED', output: 'delegate failure', failureKind: 'DELEGATE_FAILED' };
    },
  });

  const outcome = await executor.execute(request());
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.failureKind, 'DELEGATE_FAILED');
  assert.equal(outcome.output, 'delegate failure');
});
