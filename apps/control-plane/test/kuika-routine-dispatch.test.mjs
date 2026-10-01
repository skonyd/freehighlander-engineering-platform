import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createFhKuikaRoutineDispatchRequestV1 } from '@freehighlander/contracts';
import { AuthorityCapabilityStateStore } from '@freehighlander/persistence';

import {
  AuthorityCapabilityExecutionGate,
  FhKuikaRoutineDispatchRuntime,
  routineDispatchRuntimeCanGrantAuthority,
  routineDispatchRuntimeCanSkipCapabilityRecheckOnRetry,
  routineTriggerMetadataCanAuthorizeExecution,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const REPOSITORY = 'owner/repo';
const PAYLOAD = '{"trigger":"security-event"}';

function trusted(overrides = {}) {
  return {
    id: 'security-remediation',
    version: '1.0.0',
    active: true,
    workflowRef: 'remediate@1.0.0',
    mutationCapability: 'AUTOMATIC_REMEDIATION',
    maxAttempts: 2,
    ...overrides,
  };
}

function setup(resolveRoutine, activeCapabilities = []) {
  const directory = mkdtempSync(join(tmpdir(), 'fh-kuika-routine-runtime-'));
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
  const runtime = new FhKuikaRoutineDispatchRuntime({
    repository: REPOSITORY,
    revision: REVISION,
    gate,
    resolveRoutine,
  });
  return { runtime, store, gate };
}

function request(overrides = {}) {
  return createFhKuikaRoutineDispatchRequestV1({
    dispatchId: 'dispatch-1',
    routineId: 'security-remediation',
    routineVersion: '1.0.0',
    repository: REPOSITORY,
    exactRevision: REVISION,
    payloadDigest: createHash('sha256').update(PAYLOAD, 'utf8').digest('hex'),
    attempt: 1,
    ...overrides,
  });
}

function scheduler(calls, fail = false) {
  return {
    id: 'scheduler-v1',
    async submit(submission) {
      calls.push(submission);
      if (fail) throw new Error('scheduler unavailable');
    },
  };
}

test('routine dispatch is blocked by default-DENY before scheduler submission', async () => {
  const { runtime } = setup(() => trusted());
  const calls = [];
  const outcome = await runtime.submitAttempt(request(), PAYLOAD, scheduler(calls));
  assert.equal(outcome.status, 'BLOCKED');
  assert.equal(outcome.reason, 'CAPABILITY_GATE_DENIED');
  assert.equal(calls.length, 0);
  assert.equal(routineDispatchRuntimeCanGrantAuthority(), false);
  assert.equal(routineDispatchRuntimeCanSkipCapabilityRecheckOnRetry(), false);
  assert.equal(routineTriggerMetadataCanAuthorizeExecution(), false);
});

test('active capability submits exact trusted routine workflow to scheduler', async () => {
  const { runtime } = setup(() => trusted(), ['AUTOMATIC_REMEDIATION']);
  const calls = [];
  const outcome = await runtime.submitAttempt(request(), PAYLOAD, scheduler(calls));
  assert.equal(outcome.status, 'SUBMITTED');
  assert.equal(outcome.reason, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workflowRef, 'remediate@1.0.0');
  assert.equal(calls[0].authority, 'CONTROL_PLANE_POLICY_GATED');
});

test('retry rechecks current capability and observes revocation immediately', async () => {
  const { runtime, store } = setup(() => trusted(), ['AUTOMATIC_REMEDIATION']);
  const calls = [];
  assert.equal(
    (await runtime.submitAttempt(request(), PAYLOAD, scheduler(calls))).status,
    'SUBMITTED',
  );

  const current = store.read();
  store.write(current.generation, {
    schemaVersion: 1,
    requestedCapabilities: current.state.requestedCapabilities,
    activeCapabilities: [],
  });

  const retry = await runtime.submitAttempt(request({ attempt: 2 }), PAYLOAD, scheduler(calls));
  assert.equal(retry.status, 'BLOCKED');
  assert.equal(retry.reason, 'CAPABILITY_GATE_DENIED');
  assert.equal(calls.length, 1);
});

test('routine trusted state and retry limits are revalidated on every attempt', async () => {
  const cases = [
    [null, request(), 'ROUTINE_INACTIVE_OR_MISSING'],
    [trusted({ active: false }), request(), 'ROUTINE_INACTIVE_OR_MISSING'],
    [trusted({ version: '2.0.0' }), request(), 'ROUTINE_VERSION_STALE'],
    [trusted({ maxAttempts: 0 }), request({ attempt: 2 }), 'ROUTINE_RETRY_LIMIT_EXCEEDED'],
  ];

  for (const [routine, invocation, reason] of cases) {
    const { runtime } = setup(() => routine, ['AUTOMATIC_REMEDIATION']);
    const outcome = await runtime.submitAttempt(invocation, PAYLOAD, scheduler([]));
    assert.equal(outcome.status, 'BLOCKED');
    assert.equal(outcome.reason, reason);
  }
});

test('payload binding and scheduler failure are structured fail-closed results', async () => {
  const { runtime } = setup(() => trusted(), ['AUTOMATIC_REMEDIATION']);

  const binding = await runtime.submitAttempt(request(), 'different', scheduler([]));
  assert.equal(binding.status, 'BLOCKED');
  assert.equal(binding.reason, 'ROUTINE_PAYLOAD_BINDING_INVALID');

  const failed = await runtime.submitAttempt(request(), PAYLOAD, scheduler([], true));
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.reason, 'SCHEDULER_SUBMISSION_FAILED');
});

test('constructor request and scheduler identities fail closed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fh-kuika-routine-invalid-'));
  const store = new AuthorityCapabilityStateStore(join(directory, 'authority.json'));
  const gate = new AuthorityCapabilityExecutionGate({
    stateStore: store,
    expectedRevision: REVISION,
    observeRevision: () => REVISION,
  });

  assert.throws(
    () =>
      new FhKuikaRoutineDispatchRuntime({
        repository: 'bad',
        revision: REVISION,
        gate,
        resolveRoutine: () => trusted(),
      }),
    /owner\/name/,
  );
  assert.throws(
    () =>
      new FhKuikaRoutineDispatchRuntime({
        repository: REPOSITORY,
        revision: 'bad',
        gate,
        resolveRoutine: () => trusted(),
      }),
    /40-character git SHA/,
  );
  assert.throws(
    () =>
      new FhKuikaRoutineDispatchRuntime({
        repository: REPOSITORY,
        revision: REVISION,
        gate,
        resolveRoutine: null,
      }),
    /resolveRoutine/,
  );

  const { runtime } = setup(() => trusted(), ['AUTOMATIC_REMEDIATION']);
  await assert.rejects(
    () => runtime.submitAttempt(request({ repository: 'other/repo' }), PAYLOAD, scheduler([])),
    /repository does not match/,
  );
  await assert.rejects(
    () => runtime.submitAttempt(request({ exactRevision: 'b'.repeat(40) }), PAYLOAD, scheduler([])),
    /revision is stale/,
  );
  await assert.rejects(
    () => runtime.submitAttempt(request(), PAYLOAD, null),
    /scheduler adapter is required/,
  );
  await assert.rejects(
    () => runtime.submitAttempt(request(), PAYLOAD, { id: 'x', async submit() {} }),
    /bounded identifier/,
  );
});

test('malformed trusted routine configuration fails closed', async () => {
  const cases = [
    [trusted({ id: 'other' }), /id does not match/],
    [trusted({ version: 'bad' }), /semantic version/],
    [trusted({ workflowRef: 'bad' }), /workflowRef/],
    [trusted({ mutationCapability: 'UNKNOWN' }), /mutation capability is unknown/],
    [trusted({ maxAttempts: 11 }), /maxAttempts/],
  ];

  for (const [routine, pattern] of cases) {
    const { runtime } = setup(() => routine, ['AUTOMATIC_REMEDIATION']);
    await assert.rejects(() => runtime.submitAttempt(request(), PAYLOAD, scheduler([])), pattern);
  }
});
