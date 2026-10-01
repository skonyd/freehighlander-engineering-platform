import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createFhKuikaCoreExecutionRequestV1 } from '@freehighlander/contracts';
import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  FhKuikaCoreExecutionBridge,
  fhKuikaCoreExecutionBridgeCanBypassCapabilityGate,
  fhKuikaCoreExecutionBridgeCanGrantAuthority,
  fhKuikaCoreExecutionBridgeTrustsClientApprovalEvidence,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const REPOSITORY = 'skonyd/freehighlander-engineering-platform';
const PAYLOAD = '{"operation":"commit"}';

function setup(activeCapabilities = []) {
  const directory = mkdtempSync(join(tmpdir(), 'fh-kuika-core-'));
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
  const bridge = new FhKuikaCoreExecutionBridge({
    repository: REPOSITORY,
    revision: REVISION,
    gate,
  });
  return { store, gate, bridge };
}

function executionRequest(mutationClass = 'GIT_WRITE') {
  return createFhKuikaCoreExecutionRequestV1({
    requestId: 'kuika-request-1',
    surface: 'WORKBENCH',
    mutationClass,
    repository: REPOSITORY,
    exactRevision: REVISION,
    payloadDigest: createHash('sha256').update(PAYLOAD, 'utf8').digest('hex'),
  });
}

function activity(input = PAYLOAD) {
  return {
    schemaVersion: 1,
    activityId: 'activity-1',
    runId: 'run-1',
    workspaceHash: 'b'.repeat(64),
    kind: 'GIT',
    input,
    timeoutMs: 1000,
    attempt: 1,
    executionMode: 'LIVE',
  };
}

test('bridge remains authority-neutral and capability gated', async () => {
  const { bridge } = setup();
  let calls = 0;
  const executor = bridge.bind(executionRequest(), {
    id: 'trusted-delegate',
    async execute() {
      calls += 1;
      return { status: 'SUCCEEDED', output: 'ok' };
    },
  });

  const denied = await executor.execute(activity());
  assert.equal(denied.status, 'FAILED');
  assert.equal(denied.failureKind, 'CAPABILITY_GATE_DENIED');
  assert.equal(calls, 0);
  assert.equal(fhKuikaCoreExecutionBridgeCanGrantAuthority(), false);
  assert.equal(fhKuikaCoreExecutionBridgeCanBypassCapabilityGate(), false);
  assert.equal(fhKuikaCoreExecutionBridgeTrustsClientApprovalEvidence(), false);
});

test('active exact-bound request delegates only when payload digest also matches', async () => {
  const { bridge } = setup(['GIT_WRITE']);
  let calls = 0;
  const executor = bridge.bind(executionRequest(), {
    id: 'trusted-delegate',
    async execute(request) {
      calls += 1;
      return { status: 'SUCCEEDED', output: request.input };
    },
  });

  const mismatched = await executor.execute(activity('different'));
  assert.equal(mismatched.status, 'FAILED');
  assert.equal(mismatched.failureKind, 'KUIKA_EXECUTION_REQUEST_BINDING_INVALID');
  assert.equal(calls, 0);

  const allowed = await executor.execute(activity());
  assert.equal(allowed.status, 'SUCCEEDED');
  assert.equal(calls, 1);
});

test('bridge rejects stale repository revision and gate identity before binding', () => {
  const { bridge, gate } = setup();

  assert.throws(
    () =>
      bridge.bind(
        { ...executionRequest(), repository: 'other/repo' },
        {
          id: 'trusted-delegate',
          async execute() {
            return { status: 'SUCCEEDED', output: '' };
          },
        },
      ),
    /repository does not match/,
  );
  assert.throws(
    () =>
      bridge.bind(
        { ...executionRequest(), exactRevision: 'b'.repeat(40) },
        {
          id: 'trusted-delegate',
          async execute() {
            return { status: 'SUCCEEDED', output: '' };
          },
        },
      ),
    /revision is stale/,
  );
  assert.throws(
    () =>
      new FhKuikaCoreExecutionBridge({
        repository: REPOSITORY,
        revision: 'b'.repeat(40),
        gate,
      }),
    /must match authority execution gate revision/,
  );
});

test('bridge validates trusted constructor identity', () => {
  const { gate } = setup();
  assert.throws(
    () => new FhKuikaCoreExecutionBridge({ repository: 'bad', revision: REVISION, gate }),
    /owner\/name/,
  );
  assert.throws(
    () => new FhKuikaCoreExecutionBridge({ repository: REPOSITORY, revision: 'bad', gate }),
    /40-character git SHA/,
  );
});
