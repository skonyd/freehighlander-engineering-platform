import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reconcileStuckRun,
  recoveryCanAutoExecute,
  recoveryCanRepeatSideEffectWithoutIdempotency,
  runtimeRecoveryCanGrantAuthority,
  staleRunningCanRemainRunning,
} from '../dist/index.js';

function observation(overrides = {}) {
  return {
    runId: 'run-146',
    nodeId: 'node-001',
    observedState: 'RUNNING',
    lease: 'MISSING',
    exactRevisionMatches: true,
    replayManifest: 'VALID',
    checkpoint: 'MISSING',
    checkpointResumeSafe: null,
    activityEffect: 'SIDE_EFFECTING',
    idempotencyEvidence: 'ABSENT',
    ...overrides,
  };
}

test('non-running node states remain unchanged', () => {
  for (const observedState of ['READY', 'PASSED', 'FAILED', 'BLOCKED', 'HUMAN_REQUIRED']) {
    const result = reconcileStuckRun(observation({ observedState }));
    assert.equal(result.status, 'UNCHANGED');
    assert.equal(result.nextAction, 'NONE');
  }
});

test('owned active lease keeps RUNNING node live without recovery', () => {
  const result = reconcileStuckRun(observation({ lease: 'ACTIVE_OWNED' }));
  assert.deepEqual(result, {
    runId: 'run-146',
    nodeId: 'node-001',
    status: 'LIVE',
    nextAction: 'NONE',
    reason: 'RUNNING node has a valid owned active lease',
    authority: 'NONE',
    autoExecute: false,
  });
});

test('other-owner and unknown lease observations require review', () => {
  const other = reconcileStuckRun(observation({ lease: 'ACTIVE_OTHER' }));
  assert.equal(other.status, 'RECOVERY_REQUIRED');
  assert.equal(other.nextAction, 'HUMAN_REVIEW');
  assert.match(other.reason, /another active lease/);

  const unknown = reconcileStuckRun(observation({ lease: 'UNKNOWN' }));
  assert.equal(unknown.status, 'RECOVERY_REQUIRED');
  assert.equal(unknown.nextAction, 'HUMAN_REVIEW');
  assert.match(unknown.reason, /unverifiable/);
});

test('expired released and missing leases all enter deterministic interruption analysis', () => {
  for (const lease of ['EXPIRED', 'RELEASED', 'MISSING']) {
    const result = reconcileStuckRun(
      observation({
        lease,
        activityEffect: 'READ_ONLY',
        idempotencyEvidence: 'NOT_REQUIRED',
      }),
    );
    assert.equal(result.status, 'INTERRUPTED');
    assert.equal(result.nextAction, 'RERUN_SAFE');
  }
});

test('revision drift and replay evidence gaps fail closed', () => {
  const revision = reconcileStuckRun(observation({ exactRevisionMatches: false }));
  assert.equal(revision.status, 'RECOVERY_REQUIRED');
  assert.match(revision.reason, /exact revision changed/);

  for (const replayManifest of ['MISSING', 'INVALID']) {
    const result = reconcileStuckRun(observation({ replayManifest }));
    assert.equal(result.status, 'RECOVERY_REQUIRED');
    assert.equal(result.nextAction, 'HUMAN_REVIEW');
    assert.match(result.reason, /replay evidence/);
  }
});

test('invalid checkpoint blocks but safe valid checkpoint resumes exactly from checkpoint', () => {
  const invalid = reconcileStuckRun(
    observation({
      checkpoint: 'INVALID',
      checkpointResumeSafe: null,
    }),
  );
  assert.equal(invalid.status, 'RECOVERY_REQUIRED');
  assert.match(invalid.reason, /checkpoint exists but is invalid/);

  const unsafe = reconcileStuckRun(
    observation({
      checkpoint: 'VALID',
      checkpointResumeSafe: false,
    }),
  );
  assert.equal(unsafe.status, 'RECOVERY_REQUIRED');
  assert.match(unsafe.reason, /safe resume boundary/);

  const safe = reconcileStuckRun(
    observation({
      checkpoint: 'VALID',
      checkpointResumeSafe: true,
    }),
  );
  assert.equal(safe.status, 'INTERRUPTED');
  assert.equal(safe.nextAction, 'RESUME_FROM_CHECKPOINT');
  assert.match(safe.reason, /valid exact-bound replay and safe checkpoint/);
});

test('read-only interruption may rerun with valid replay evidence', () => {
  const result = reconcileStuckRun(
    observation({
      activityEffect: 'READ_ONLY',
      idempotencyEvidence: 'NOT_REQUIRED',
    }),
  );
  assert.equal(result.status, 'INTERRUPTED');
  assert.equal(result.nextAction, 'RERUN_SAFE');
  assert.match(result.reason, /read-only/);
});

test('side-effecting interruption reruns only with explicit idempotency evidence', () => {
  const proven = reconcileStuckRun(
    observation({
      activityEffect: 'SIDE_EFFECTING',
      idempotencyEvidence: 'PROVEN',
    }),
  );
  assert.equal(proven.status, 'INTERRUPTED');
  assert.equal(proven.nextAction, 'RERUN_SAFE');
  assert.match(proven.reason, /explicit idempotency evidence/);

  const absent = reconcileStuckRun(
    observation({
      activityEffect: 'SIDE_EFFECTING',
      idempotencyEvidence: 'ABSENT',
    }),
  );
  assert.equal(absent.status, 'RECOVERY_REQUIRED');
  assert.equal(absent.nextAction, 'HUMAN_REVIEW');
  assert.match(absent.reason, /lacks idempotency evidence/);
});

test('observation identifiers and enums fail closed on malformed input', () => {
  const malformed = [
    observation({ runId: 'x' }),
    observation({ nodeId: 'x' }),
    observation({ observedState: 'UNKNOWN' }),
    observation({ lease: 'BROKEN' }),
    observation({ replayManifest: 'BROKEN' }),
    observation({ checkpoint: 'BROKEN' }),
    observation({ activityEffect: 'UNKNOWN' }),
    observation({ idempotencyEvidence: 'UNKNOWN' }),
  ];

  for (const value of malformed) {
    assert.throws(() => reconcileStuckRun(value));
  }
});

test('checkpoint resume-safety metadata is valid only for valid checkpoints', () => {
  assert.throws(
    () =>
      reconcileStuckRun(
        observation({
          checkpoint: 'VALID',
          checkpointResumeSafe: null,
        }),
      ),
    /valid checkpoint requires/,
  );

  for (const checkpoint of ['MISSING', 'INVALID']) {
    assert.throws(
      () =>
        reconcileStuckRun(
          observation({
            checkpoint,
            checkpointResumeSafe: true,
          }),
        ),
      /only valid for a valid checkpoint/,
    );
  }
});

test('idempotency metadata must match activity effect', () => {
  assert.throws(
    () =>
      reconcileStuckRun(
        observation({
          activityEffect: 'READ_ONLY',
          idempotencyEvidence: 'PROVEN',
        }),
      ),
    /READ_ONLY|read-only/,
  );

  assert.throws(
    () =>
      reconcileStuckRun(
        observation({
          activityEffect: 'SIDE_EFFECTING',
          idempotencyEvidence: 'NOT_REQUIRED',
        }),
      ),
    /SIDE_EFFECTING|side-effecting/,
  );
});

test('all supported RUNNING lease and evidence enum values validate', () => {
  for (const lease of ['ACTIVE_OWNED', 'ACTIVE_OTHER', 'EXPIRED', 'RELEASED', 'MISSING', 'UNKNOWN']) {
    assert.doesNotThrow(() =>
      reconcileStuckRun(
        observation({
          lease,
          activityEffect: 'READ_ONLY',
          idempotencyEvidence: 'NOT_REQUIRED',
        }),
      ),
    );
  }

  for (const checkpoint of ['MISSING', 'INVALID']) {
    assert.doesNotThrow(() =>
      reconcileStuckRun(
        observation({
          checkpoint,
          checkpointResumeSafe: null,
          activityEffect: 'READ_ONLY',
          idempotencyEvidence: 'NOT_REQUIRED',
        }),
      ),
    );
  }
});

test('recovery reconciliation cannot grant authority or auto-repeat side effects', () => {
  assert.equal(staleRunningCanRemainRunning(), false);
  assert.equal(recoveryCanRepeatSideEffectWithoutIdempotency(), false);
  assert.equal(recoveryCanAutoExecute(), false);
  assert.equal(runtimeRecoveryCanGrantAuthority(), false);
});
