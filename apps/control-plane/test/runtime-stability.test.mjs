import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquireRunLease,
  buildRunIntentIdentity,
  createMonotonicDeadline,
  expiredLeaseCanRepeatSideEffects,
  releaseBulkheadPermit,
  releaseRunLease,
  remainingMonotonicBudgetMs,
  renewRunLease,
  requestBulkheadPermit,
  runLeaseIsActive,
  runtimeStabilityCanGrantAuthority,
  waitingCountsAsSemanticRetry,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);

function intentInput(overrides = {}) {
  return {
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    taskIdentity: 'issue-146',
    exactRevision: 'abc123',
    workflowHash: H1,
    runSnapshotHash: H2,
    bindingSnapshotHash: H3,
    ...overrides,
  };
}

function leaseRequest(overrides = {}) {
  return {
    runId: 'run-001',
    leaseId: 'lease-001',
    nowMonoMs: 100,
    ttlMs: 50,
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    maxGlobalActive: 2,
    maxPerProviderActive: 1,
    maxQueued: 2,
    ...overrides,
  };
}

function bulkheadRequest(requestId, providerId, enqueuedMonoMs = 100) {
  return { requestId, providerId, enqueuedMonoMs };
}

test('run intent identity is deterministic exact-bound and authority-neutral', () => {
  const first = buildRunIntentIdentity(intentInput());
  const second = buildRunIntentIdentity(intentInput());

  assert.deepEqual(first, second);
  assert.match(first.intentKey, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');

  for (const input of [
    intentInput({ repositoryIdentity: ' ' }),
    intentInput({ taskIdentity: 'x' }),
    intentInput({ exactRevision: '' }),
    intentInput({ workflowHash: 'bad' }),
    intentInput({ runSnapshotHash: 'bad' }),
    intentInput({ bindingSnapshotHash: 'bad' }),
  ]) {
    assert.throws(() => buildRunIntentIdentity(input));
  }
});

test('single-flight lease attaches duplicates and reclaims only expired or released leases', () => {
  const intent = buildRunIntentIdentity(intentInput());

  const acquired = acquireRunLease(intent, leaseRequest(), null);
  assert.equal(acquired.status, 'ACQUIRED');
  assert.equal(acquired.lease.generation, 1);
  assert.equal(acquired.reclaimedExpiredLease, false);
  assert.equal(acquired.lease.expiresAtMonoMs, 150);

  const duplicate = acquireRunLease(
    intent,
    leaseRequest({ runId: 'run-002', leaseId: 'lease-002', nowMonoMs: 120 }),
    acquired.lease,
  );
  assert.equal(duplicate.status, 'ATTACHED_EXISTING');
  assert.deepEqual(duplicate.lease, acquired.lease);
  assert.equal(duplicate.reclaimedExpiredLease, false);

  const expired = acquireRunLease(
    intent,
    leaseRequest({ runId: 'run-003', leaseId: 'lease-003', nowMonoMs: 150 }),
    acquired.lease,
  );
  assert.equal(expired.status, 'ACQUIRED');
  assert.equal(expired.lease.generation, 2);
  assert.equal(expired.reclaimedExpiredLease, true);

  const released = releaseRunLease(expired.lease, 'lease-003', 2);
  const reacquired = acquireRunLease(
    intent,
    leaseRequest({ runId: 'run-004', leaseId: 'lease-004', nowMonoMs: 151 }),
    released,
  );
  assert.equal(reacquired.status, 'ACQUIRED');
  assert.equal(reacquired.lease.generation, 3);
  assert.equal(reacquired.reclaimedExpiredLease, false);

  const otherIntent = buildRunIntentIdentity(intentInput({ exactRevision: 'def456' }));
  assert.throws(
    () => acquireRunLease(otherIntent, leaseRequest(), acquired.lease),
    /intentKey mismatch/,
  );
});

test('lease renewal release and active-state checks are exact-owner fail-closed', () => {
  const intent = buildRunIntentIdentity(intentInput());
  const lease = acquireRunLease(intent, leaseRequest(), null).lease;

  const renewed = renewRunLease(lease, lease.leaseId, lease.generation, 120, 100);
  assert.equal(renewed.expiresAtMonoMs, 220);
  assert.equal(runLeaseIsActive(renewed, 219), true);
  assert.equal(runLeaseIsActive(renewed, 220), false);

  assert.throws(() => renewRunLease(lease, 'lease-other', 1, 110, 10), /ownership mismatch/);
  assert.throws(() => renewRunLease(lease, lease.leaseId, 2, 110, 10), /ownership mismatch/);
  assert.throws(() => renewRunLease(lease, lease.leaseId, 1, 150, 10), /expired lease/);

  const released = releaseRunLease(lease, lease.leaseId, lease.generation);
  assert.equal(released.state, 'RELEASED');
  assert.equal(runLeaseIsActive(released, 120), false);
  assert.throws(() => renewRunLease(released, released.leaseId, 1, 120, 10), /released lease/);
  assert.throws(() => releaseRunLease(lease, 'lease-other', 1), /ownership mismatch/);
  assert.throws(() => releaseRunLease(lease, lease.leaseId, 2), /ownership mismatch/);
  assert.throws(() => releaseRunLease(released, released.leaseId, 1), /already released/);
});

test('lease structures reject malformed identity ownership time generation and authority', () => {
  const intent = buildRunIntentIdentity(intentInput());
  const lease = acquireRunLease(intent, leaseRequest(), null).lease;

  assert.throws(() => acquireRunLease({ ...intent, schemaVersion: 2 }, leaseRequest(), null));
  assert.throws(() =>
    acquireRunLease({ ...intent, intentKey: H1 }, leaseRequest(), null),
  );
  assert.throws(() =>
    acquireRunLease({ ...intent, authority: 'SYSTEM_POLICY' }, leaseRequest(), null),
  );

  for (const request of [
    leaseRequest({ runId: 'x' }),
    leaseRequest({ leaseId: 'x' }),
    leaseRequest({ nowMonoMs: -1 }),
    leaseRequest({ nowMonoMs: Number.POSITIVE_INFINITY }),
    leaseRequest({ ttlMs: 0 }),
    leaseRequest({ ttlMs: 1.5 }),
  ]) {
    assert.throws(() => acquireRunLease(intent, request, null));
  }

  for (const malformed of [
    { ...lease, schemaVersion: 2 },
    { ...lease, intentKey: 'bad' },
    { ...lease, runId: 'x' },
    { ...lease, leaseId: 'x' },
    { ...lease, generation: 0 },
    { ...lease, generation: 1.5 },
    { ...lease, acquiredAtMonoMs: -1 },
    { ...lease, acquiredAtMonoMs: Number.NaN },
    { ...lease, expiresAtMonoMs: lease.acquiredAtMonoMs },
    { ...lease, state: 'UNKNOWN' },
    { ...lease, authority: 'SYSTEM_POLICY' },
  ]) {
    assert.throws(() => runLeaseIsActive(malformed, 110));
  }

  assert.throws(() => runLeaseIsActive(lease, -1));
  assert.throws(() => renewRunLease(lease, lease.leaseId, 0, 110, 10));
  assert.throws(() => renewRunLease(lease, lease.leaseId, 1, 110, 0));
});

test('bulkhead acquires within global and per-provider capacity and measures queue wait', () => {
  let snapshot = { active: [], queued: [] };

  const first = requestBulkheadPermit(
    snapshot,
    policy(),
    bulkheadRequest('request-001', 'provider-a', 90),
    100,
  );
  assert.equal(first.status, 'ACQUIRED');
  assert.equal(first.permit.queueWaitMs, 10);
  assert.equal(first.snapshot.active.length, 1);
  snapshot = first.snapshot;

  const providerSaturated = requestBulkheadPermit(
    snapshot,
    policy(),
    bulkheadRequest('request-002', 'provider-a', 100),
    100,
  );
  assert.equal(providerSaturated.status, 'QUEUED');
  assert.equal(providerSaturated.snapshot.queued.length, 1);

  const otherProvider = requestBulkheadPermit(
    providerSaturated.snapshot,
    policy(),
    bulkheadRequest('request-003', 'provider-b', 100),
    100,
  );
  assert.equal(otherProvider.status, 'ACQUIRED');
  assert.equal(otherProvider.snapshot.active.length, 2);

  const globallySaturated = requestBulkheadPermit(
    otherProvider.snapshot,
    policy(),
    bulkheadRequest('request-004', 'provider-c', 100),
    100,
  );
  assert.equal(globallySaturated.status, 'QUEUED');

  const queueFull = requestBulkheadPermit(
    globallySaturated.snapshot,
    policy(),
    bulkheadRequest('request-005', 'provider-c', 100),
    100,
  );
  assert.equal(queueFull.status, 'REJECTED');
  assert.deepEqual(queueFull.snapshot, globallySaturated.snapshot);
});

test('bulkhead release promotes first eligible queued request and preserves provider limits', () => {
  const p = policy();
  const a = requestBulkheadPermit(
    { active: [], queued: [] },
    p,
    bulkheadRequest('request-001', 'provider-a'),
    100,
  );
  const aQueued = requestBulkheadPermit(
    a.snapshot,
    p,
    bulkheadRequest('request-002', 'provider-a'),
    100,
  );
  const b = requestBulkheadPermit(
    aQueued.snapshot,
    p,
    bulkheadRequest('request-003', 'provider-b'),
    100,
  );

  const releaseB = releaseBulkheadPermit(b.snapshot, p, b.permit.permitId, 120);
  assert.equal(releaseB.promotedPermit, null);
  assert.equal(releaseB.snapshot.queued[0].requestId, 'request-002');

  const releaseA = releaseBulkheadPermit(
    releaseB.snapshot,
    p,
    a.permit.permitId,
    130,
  );
  assert.equal(releaseA.promotedPermit.requestId, 'request-002');
  assert.equal(releaseA.promotedPermit.queueWaitMs, 30);
  assert.equal(releaseA.snapshot.queued.length, 0);

  assert.throws(
    () => releaseBulkheadPermit(releaseA.snapshot, p, 'permit:unknown', 140),
    /unknown bulkhead permit/,
  );
});

test('bulkhead rejects duplicate requests malformed state and backwards monotonic time', () => {
  const p = policy();
  const acquired = requestBulkheadPermit(
    { active: [], queued: [] },
    p,
    bulkheadRequest('request-001', 'provider-a'),
    100,
  );

  assert.throws(() =>
    requestBulkheadPermit(
      acquired.snapshot,
      p,
      bulkheadRequest('request-001', 'provider-b'),
      100,
    ),
  );
  assert.throws(() =>
    requestBulkheadPermit(
      acquired.snapshot,
      p,
      bulkheadRequest('request-002', 'provider-b', 101),
      100,
    ),
  );

  const queued = requestBulkheadPermit(
    acquired.snapshot,
    policy({ maxGlobalActive: 1 }),
    bulkheadRequest('request-002', 'provider-b'),
    100,
  );
  assert.throws(() =>
    requestBulkheadPermit(
      queued.snapshot,
      policy({ maxGlobalActive: 1 }),
      bulkheadRequest('request-002', 'provider-b'),
      100,
    ),
  );

  for (const invalidPolicy of [
    policy({ maxGlobalActive: 0 }),
    policy({ maxGlobalActive: 1.5 }),
    policy({ maxPerProviderActive: 0 }),
    policy({ maxQueued: -1 }),
    policy({ maxQueued: 1.5 }),
  ]) {
    assert.throws(() =>
      requestBulkheadPermit(
        { active: [], queued: [] },
        invalidPolicy,
        bulkheadRequest('request-new', 'provider-a'),
        100,
      ),
    );
  }

  for (const invalidRequest of [
    bulkheadRequest('x', 'provider-a'),
    bulkheadRequest('request-new', 'x'),
    bulkheadRequest('request-new', 'provider-a', -1),
    bulkheadRequest('request-new', 'provider-a', Number.NaN),
  ]) {
    assert.throws(() =>
      requestBulkheadPermit({ active: [], queued: [] }, p, invalidRequest, 100),
    );
  }

  assert.throws(() =>
    requestBulkheadPermit(
      { active: [], queued: [] },
      p,
      bulkheadRequest('request-new', 'provider-a'),
      -1,
    ),
  );

  const duplicateActive = {
    active: [
      {
        permitId: 'permit:request-001',
        requestId: 'request-001',
        providerId: 'provider-a',
        acquiredMonoMs: 100,
        queueWaitMs: 0,
      },
      {
        permitId: 'permit:request-002',
        requestId: 'request-001',
        providerId: 'provider-b',
        acquiredMonoMs: 100,
        queueWaitMs: 0,
      },
    ],
    queued: [],
  };
  assert.throws(() =>
    requestBulkheadPermit(
      duplicateActive,
      p,
      bulkheadRequest('request-new', 'provider-a'),
      100,
    ),
  );

  const duplicateQueued = {
    active: acquired.snapshot.active,
    queued: [bulkheadRequest('request-001', 'provider-b')],
  };
  assert.throws(() =>
    requestBulkheadPermit(
      duplicateQueued,
      p,
      bulkheadRequest('request-new', 'provider-a'),
      100,
    ),
  );

  const malformedSnapshots = [
    {
      active: [{ ...acquired.permit, permitId: 'x' }],
      queued: [],
    },
    {
      active: [{ ...acquired.permit, requestId: 'x' }],
      queued: [],
    },
    {
      active: [{ ...acquired.permit, providerId: 'x' }],
      queued: [],
    },
    {
      active: [{ ...acquired.permit, acquiredMonoMs: -1 }],
      queued: [],
    },
    {
      active: [{ ...acquired.permit, queueWaitMs: -1 }],
      queued: [],
    },
  ];
  for (const malformed of malformedSnapshots) {
    assert.throws(() =>
      requestBulkheadPermit(
        malformed,
        p,
        bulkheadRequest('request-new', 'provider-a'),
        100,
      ),
    );
  }

  const futureQueue = {
    active: acquired.snapshot.active,
    queued: [bulkheadRequest('request-future', 'provider-b', 200)],
  };
  assert.throws(
    () => releaseBulkheadPermit(futureQueue, p, acquired.permit.permitId, 150),
    /monotonic clock moved backwards/,
  );
});

test('zero-length bulkhead queue rejects immediately when saturated', () => {
  const p = policy({ maxGlobalActive: 1, maxQueued: 0 });
  const first = requestBulkheadPermit(
    { active: [], queued: [] },
    p,
    bulkheadRequest('request-001', 'provider-a'),
    100,
  );
  const second = requestBulkheadPermit(
    first.snapshot,
    p,
    bulkheadRequest('request-002', 'provider-b'),
    100,
  );
  assert.equal(second.status, 'REJECTED');
});

test('monotonic deadlines are bounded by parent and ignore wall-clock concerns', () => {
  const root = createMonotonicDeadline(100, 50);
  assert.equal(root.deadlineMonoMs, 150);
  assert.equal(root.parentDeadlineMonoMs, null);
  assert.equal(remainingMonotonicBudgetMs(root, 120), 30);
  assert.equal(remainingMonotonicBudgetMs(root, 160), 0);

  const tighterParent = createMonotonicDeadline(110, 100, 140);
  assert.equal(tighterParent.deadlineMonoMs, 140);

  const looserParent = createMonotonicDeadline(110, 10, 200);
  assert.equal(looserParent.deadlineMonoMs, 120);

  assert.throws(() => createMonotonicDeadline(100, 50, 100), /already expired/);
  assert.throws(() => createMonotonicDeadline(-1, 50));
  assert.throws(() => createMonotonicDeadline(100, 0));
  assert.throws(() => createMonotonicDeadline(100, 1.5));
  assert.throws(() => createMonotonicDeadline(100, 50, -1));
});

test('malformed deadline records fail closed on remaining-budget evaluation', () => {
  const deadline = createMonotonicDeadline(100, 50);

  for (const malformed of [
    { ...deadline, schemaVersion: 2 },
    { ...deadline, createdAtMonoMs: -1 },
    { ...deadline, deadlineMonoMs: deadline.createdAtMonoMs },
    { ...deadline, parentDeadlineMonoMs: -1 },
    { ...deadline, parentDeadlineMonoMs: 120, deadlineMonoMs: 130 },
    { ...deadline, authority: 'SYSTEM_POLICY' },
  ]) {
    assert.throws(() => remainingMonotonicBudgetMs(malformed, 110));
  }
  assert.throws(() => remainingMonotonicBudgetMs(deadline, -1));
});

test('runtime stability guards cannot grant authority or convert waiting into semantic retry', () => {
  assert.equal(runtimeStabilityCanGrantAuthority(), false);
  assert.equal(waitingCountsAsSemanticRetry(), false);
  assert.equal(expiredLeaseCanRepeatSideEffects(), false);
});
