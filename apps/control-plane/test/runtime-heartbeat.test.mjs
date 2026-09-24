import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceRuntimeHeartbeat,
  classifyRuntimeActivityLiveness,
  createRuntimeHeartbeat,
  heartbeatCanAuthorizeReplay,
  heartbeatCanCarrySecretValue,
  heartbeatCanDeclareSemanticSuccess,
  heartbeatCanGrantAuthority,
  validateRuntimeHeartbeat,
} from '../dist/index.js';

function identity(overrides = {}) {
  return {
    runId: 'run-001',
    nodeId: 'node-001',
    activityId: 'activity-001',
    ...overrides,
  };
}

function progress(overrides = {}) {
  return {
    phase: 'provider-call',
    completedUnits: 1,
    totalUnits: 3,
    detailCode: 'STREAMING',
    ...overrides,
  };
}

test('heartbeat creation normalizes bounded progress and remains authority-neutral', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 0, 100, 200, progress());
  assert.deepEqual(heartbeat, {
    schemaVersion: 1,
    runId: 'run-001',
    nodeId: 'node-001',
    activityId: 'activity-001',
    sequence: 0,
    recordedAtMonoMs: 100,
    leaseExpiresAtMonoMs: 200,
    progress: {
      phase: 'provider-call',
      completedUnits: 1,
      totalUnits: 3,
      detailCode: 'STREAMING',
    },
    authority: 'NONE',
  });
  assert.doesNotThrow(() => validateRuntimeHeartbeat(heartbeat));
});

test('heartbeat sequence advances monotonically and preserves identity', () => {
  const first = createRuntimeHeartbeat(identity(), 0, 100, 200, progress());
  const second = advanceRuntimeHeartbeat(first, 120, 220, progress({ completedUnits: 2 }));

  assert.equal(second.sequence, 1);
  assert.equal(second.runId, first.runId);
  assert.equal(second.nodeId, first.nodeId);
  assert.equal(second.activityId, first.activityId);
  assert.equal(second.recordedAtMonoMs, 120);

  assert.throws(
    () => advanceRuntimeHeartbeat(first, 99, 220, progress()),
    /cannot move backwards/,
  );
});

test('active lease and fresh heartbeat classify as progressing', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 4, 100, 250, progress());
  const result = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'ACTIVE',
    heartbeat,
    nowMonoMs: 130,
    maxSilenceMs: 50,
  });

  assert.deepEqual(result, {
    status: 'ACTIVE_PROGRESSING',
    reason: 'heartbeat is within liveness budget',
    heartbeatAgeMs: 30,
    authority: 'NONE',
    semanticSuccess: false,
  });
});

test('fresh active lease without heartbeat is recovery-required', () => {
  const result = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'ACTIVE',
    heartbeat: null,
    nowMonoMs: 130,
    maxSilenceMs: 50,
  });

  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(result.heartbeatAgeMs, null);
  assert.match(result.reason, /no heartbeat evidence/);
});

test('active lease with stale heartbeat is stalled', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 1, 100, 400, progress());
  const result = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'ACTIVE',
    heartbeat,
    nowMonoMs: 151,
    maxSilenceMs: 50,
  });

  assert.equal(result.status, 'STALLED');
  assert.equal(result.heartbeatAgeMs, 51);
  assert.match(result.reason, /max silence budget/);
});

test('expired and missing leases classify as interrupted with bounded age evidence', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 2, 100, 150, progress());

  const expired = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'EXPIRED',
    heartbeat,
    nowMonoMs: 160,
    maxSilenceMs: 50,
  });
  assert.equal(expired.status, 'INTERRUPTED');
  assert.equal(expired.heartbeatAgeMs, 60);
  assert.match(expired.reason, /lease expired/);

  const missing = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'MISSING',
    heartbeat: null,
    nowMonoMs: 160,
    maxSilenceMs: 50,
  });
  assert.equal(missing.status, 'INTERRUPTED');
  assert.equal(missing.heartbeatAgeMs, null);
  assert.match(missing.reason, /lease is missing/);
});

test('unknown lease liveness is always recovery-required', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 1, 100, 200, progress());
  const result = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'UNKNOWN',
    heartbeat,
    nowMonoMs: 120,
    maxSilenceMs: 50,
  });

  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(result.heartbeatAgeMs, null);
  assert.match(result.reason, /unverifiable/);
});

test('active lease conflicting with heartbeat expiry fails closed', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 1, 100, 150, progress());
  const result = classifyRuntimeActivityLiveness({
    identity: identity(),
    lease: 'ACTIVE',
    heartbeat,
    nowMonoMs: 150,
    maxSilenceMs: 100,
  });

  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(result.heartbeatAgeMs, 50);
  assert.match(result.reason, /conflicts with heartbeat lease expiry/);
});

test('heartbeat identity and monotonic clock mismatches fail closed', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 1, 100, 200, progress());

  assert.throws(
    () =>
      classifyRuntimeActivityLiveness({
        identity: identity({ activityId: 'activity-002' }),
        lease: 'ACTIVE',
        heartbeat,
        nowMonoMs: 120,
        maxSilenceMs: 50,
      }),
    /identity mismatch/,
  );

  assert.throws(
    () =>
      classifyRuntimeActivityLiveness({
        identity: identity(),
        lease: 'ACTIVE',
        heartbeat,
        nowMonoMs: 99,
        maxSilenceMs: 50,
      }),
    /future/,
  );
});

test('heartbeat and progress validation rejects malformed or unbounded metadata', () => {
  const invalidIdentity = [
    identity({ runId: 'x' }),
    identity({ nodeId: 'x' }),
    identity({ activityId: 'x' }),
  ];
  for (const value of invalidIdentity) {
    assert.throws(() => createRuntimeHeartbeat(value, 0, 100, 200, progress()));
  }

  const invalidProgress = [
    progress({ phase: 'x' }),
    progress({ completedUnits: -1 }),
    progress({ completedUnits: 1.5 }),
    progress({ totalUnits: -1 }),
    progress({ totalUnits: 1.5 }),
    progress({ completedUnits: 4, totalUnits: 3 }),
    progress({ detailCode: 'x' }),
  ];
  for (const value of invalidProgress) {
    assert.throws(() => createRuntimeHeartbeat(identity(), 0, 100, 200, value));
  }

  assert.throws(() => createRuntimeHeartbeat(identity(), -1, 100, 200, progress()));
  assert.throws(() => createRuntimeHeartbeat(identity(), 1.5, 100, 200, progress()));
  assert.throws(() => createRuntimeHeartbeat(identity(), 0, -1, 200, progress()));
  assert.throws(() => createRuntimeHeartbeat(identity(), 0, 100, 100, progress()));
  assert.throws(() => createRuntimeHeartbeat(identity(), 0, 100, Number.NaN, progress()));
});

test('nullable progress counters and detail code are accepted as metadata-only state', () => {
  const heartbeat = createRuntimeHeartbeat(
    identity(),
    0,
    100,
    200,
    progress({
      completedUnits: null,
      totalUnits: null,
      detailCode: null,
    }),
  );
  assert.deepEqual(heartbeat.progress, {
    phase: 'provider-call',
    completedUnits: null,
    totalUnits: null,
    detailCode: null,
  });
});

test('heartbeat validation catches schema authority and non-canonical tampering', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 0, 100, 200, progress());

  assert.throws(() => validateRuntimeHeartbeat({ ...heartbeat, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(
    () => validateRuntimeHeartbeat({ ...heartbeat, authority: 'SYSTEM_POLICY' }),
    /authority/,
  );
  assert.throws(
    () =>
      validateRuntimeHeartbeat({
        ...heartbeat,
        progress: {
          ...heartbeat.progress,
          completedUnits: 2,
        },
      }),
    /canonically normalized|completedUnits/,
  );
});

test('liveness configuration enums and silence budgets fail closed', () => {
  const heartbeat = createRuntimeHeartbeat(identity(), 1, 100, 200, progress());

  assert.throws(() =>
    classifyRuntimeActivityLiveness({
      identity: identity(),
      lease: 'BROKEN',
      heartbeat,
      nowMonoMs: 120,
      maxSilenceMs: 50,
    }),
  );

  assert.throws(() =>
    classifyRuntimeActivityLiveness({
      identity: identity(),
      lease: 'ACTIVE',
      heartbeat,
      nowMonoMs: 120,
      maxSilenceMs: 0,
    }),
  );
});

test('heartbeat metadata never grants semantic or replay authority', () => {
  assert.equal(heartbeatCanGrantAuthority(), false);
  assert.equal(heartbeatCanDeclareSemanticSuccess(), false);
  assert.equal(heartbeatCanAuthorizeReplay(), false);
  assert.equal(heartbeatCanCarrySecretValue(), false);
});
