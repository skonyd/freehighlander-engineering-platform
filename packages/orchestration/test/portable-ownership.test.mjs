import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquirePortableOwnershipLease,
  portableMachineInstanceIdCanGrantOwnership,
  portableOwnershipCanGrantAuthority,
  portableOwnershipCanTakeOverActiveLease,
  portableOwnershipLeaseIsActive,
  releasePortableOwnershipLease,
  renewPortableOwnershipLease,
  validatePortableOwnershipLease,
} from '../dist/index.js';

function request(overrides = {}) {
  return {
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    workItemId: 'issue-151',
    runId: 'run-151',
    leaseId: 'lease-machine-a',
    machineInstanceId: 'machine-a',
    now: '2026-09-25T07:00:00.000Z',
    ttlMs: 60_000,
    lastCheckpointGeneration: 3,
    ...overrides,
  };
}

test('portable ownership blocks a live old-machine lease and ignores machine identity for authority', () => {
  const acquired = acquirePortableOwnershipLease(request(), null);
  assert.equal(acquired.status, 'ACQUIRED');
  assert.equal(acquired.lease.generation, 1);
  assert.equal(acquired.lease.state, 'ACTIVE');
  assert.equal(acquired.lease.expiresAt, '2026-09-25T07:01:00.000Z');
  assert.equal(acquired.lease.lastCheckpointGeneration, 3);
  assert.match(acquired.lease.leaseHash, /^[a-f0-9]{64}$/);
  assert.equal(acquired.authority, 'NONE');

  const blocked = acquirePortableOwnershipLease(
    request({
      leaseId: 'lease-machine-b',
      machineInstanceId: 'machine-b',
      now: '2026-09-25T07:00:30.000Z',
    }),
    acquired.lease,
  );
  assert.equal(blocked.status, 'BLOCKED_ACTIVE');
  assert.deepEqual(blocked.lease, acquired.lease);
  assert.equal(blocked.reclaimedExpiredLease, false);
  assert.equal(portableOwnershipLeaseIsActive(blocked.lease, '2026-09-25T07:00:59.999Z'), true);
});

test('expired or explicitly released portable ownership can be reacquired with next generation', () => {
  const first = acquirePortableOwnershipLease(request(), null).lease;
  const expired = acquirePortableOwnershipLease(
    request({
      leaseId: 'lease-machine-b',
      machineInstanceId: 'machine-b',
      now: '2026-09-25T07:01:00.000Z',
      lastCheckpointGeneration: 4,
    }),
    first,
  );
  assert.equal(expired.status, 'ACQUIRED');
  assert.equal(expired.lease.generation, 2);
  assert.equal(expired.reclaimedExpiredLease, true);
  assert.equal(expired.lease.machineInstanceId, 'machine-b');

  const released = releasePortableOwnershipLease(
    expired.lease,
    expired.lease.leaseId,
    expired.lease.generation,
    '2026-09-25T07:01:10.000Z',
  );
  assert.equal(released.state, 'RELEASED');
  assert.equal(released.releasedAt, '2026-09-25T07:01:10.000Z');
  assert.equal(portableOwnershipLeaseIsActive(released, '2026-09-25T07:01:11.000Z'), false);
  assert.throws(
    () =>
      acquirePortableOwnershipLease(
        request({
          leaseId: 'lease-too-early',
          machineInstanceId: 'machine-too-early',
          now: '2026-09-25T07:01:09.999Z',
          lastCheckpointGeneration: 4,
        }),
        released,
      ),
    /predates release/,
  );

  const afterRelease = acquirePortableOwnershipLease(
    request({
      leaseId: 'lease-machine-c',
      machineInstanceId: 'machine-c',
      now: '2026-09-25T07:01:11.000Z',
      lastCheckpointGeneration: 4,
    }),
    released,
  );
  assert.equal(afterRelease.status, 'ACQUIRED');
  assert.equal(afterRelease.lease.generation, 3);
  assert.equal(afterRelease.reclaimedExpiredLease, false);
});

test('portable ownership renew is exact-owner checkpoint-monotonic and extends expiry', () => {
  const lease = acquirePortableOwnershipLease(request(), null).lease;
  const renewed = renewPortableOwnershipLease(
    lease,
    lease.leaseId,
    lease.generation,
    '2026-09-25T07:00:30.000Z',
    120_000,
    5,
  );

  assert.equal(renewed.expiresAt, '2026-09-25T07:02:30.000Z');
  assert.equal(renewed.lastCheckpointGeneration, 5);
  assert.notEqual(renewed.leaseHash, lease.leaseHash);

  assert.throws(
    () =>
      renewPortableOwnershipLease(
        lease,
        'lease-other',
        lease.generation,
        '2026-09-25T07:00:30.000Z',
        120_000,
        3,
      ),
    /ownership mismatch/,
  );
  assert.throws(
    () =>
      renewPortableOwnershipLease(
        lease,
        lease.leaseId,
        lease.generation + 1,
        '2026-09-25T07:00:30.000Z',
        120_000,
        3,
      ),
    /ownership mismatch/,
  );
  assert.throws(
    () =>
      renewPortableOwnershipLease(
        lease,
        lease.leaseId,
        lease.generation,
        '2026-09-25T07:01:00.000Z',
        120_000,
        3,
      ),
    /expired/,
  );
  assert.throws(
    () =>
      renewPortableOwnershipLease(
        lease,
        lease.leaseId,
        lease.generation,
        '2026-09-25T07:00:30.000Z',
        20_000,
        3,
      ),
    /must extend expiry/,
  );
  assert.throws(
    () =>
      renewPortableOwnershipLease(
        lease,
        lease.leaseId,
        lease.generation,
        '2026-09-25T07:00:30.000Z',
        120_000,
        2,
      ),
    /cannot move backwards/,
  );
});

test('portable ownership release is exact-owner and cannot be repeated or backdated', () => {
  const lease = acquirePortableOwnershipLease(request(), null).lease;

  assert.throws(
    () =>
      releasePortableOwnershipLease(
        lease,
        'lease-other',
        lease.generation,
        '2026-09-25T07:00:10.000Z',
      ),
    /ownership mismatch/,
  );
  assert.throws(
    () =>
      releasePortableOwnershipLease(
        lease,
        lease.leaseId,
        lease.generation + 1,
        '2026-09-25T07:00:10.000Z',
      ),
    /ownership mismatch/,
  );
  assert.throws(
    () =>
      releasePortableOwnershipLease(
        lease,
        lease.leaseId,
        lease.generation,
        '2026-09-25T06:59:59.999Z',
      ),
    /predates acquisition/,
  );

  const released = releasePortableOwnershipLease(
    lease,
    lease.leaseId,
    lease.generation,
    '2026-09-25T07:00:10.000Z',
  );
  assert.throws(
    () =>
      releasePortableOwnershipLease(
        released,
        released.leaseId,
        released.generation,
        '2026-09-25T07:00:11.000Z',
      ),
    /already released/,
  );
  assert.throws(
    () =>
      renewPortableOwnershipLease(
        released,
        released.leaseId,
        released.generation,
        '2026-09-25T07:00:11.000Z',
        120_000,
        3,
      ),
    /cannot be renewed/,
  );
});

test('portable ownership refuses scope drift checkpoint rollback and malformed requests', () => {
  const lease = acquirePortableOwnershipLease(request(), null).lease;

  for (const drift of [
    request({ repositoryIdentity: 'skonyd/other-repository' }),
    request({ projectId: 'project-999' }),
    request({ workItemId: 'issue-999' }),
    request({ runId: 'run-999' }),
  ]) {
    assert.throws(() => acquirePortableOwnershipLease(drift, lease), /scope mismatch/);
  }

  assert.throws(
    () =>
      acquirePortableOwnershipLease(
        request({
          leaseId: 'lease-new',
          now: '2026-09-25T07:01:00.000Z',
          lastCheckpointGeneration: 2,
        }),
        lease,
      ),
    /cannot move backwards/,
  );

  for (const malformed of [
    request({ repositoryIdentity: ' ' }),
    request({ projectId: 'x' }),
    request({ workItemId: 'x' }),
    request({ runId: 'x' }),
    request({ leaseId: 'x' }),
    request({ machineInstanceId: 'x' }),
    request({ now: 'not-a-date' }),
    request({ now: '2026-09-25T10:00:00+03:00' }),
    request({ ttlMs: 0 }),
    request({ ttlMs: 1.5 }),
    request({ lastCheckpointGeneration: -1 }),
    request({ lastCheckpointGeneration: 1.5 }),
  ]) {
    assert.throws(() => acquirePortableOwnershipLease(malformed, null));
  }
});

test('portable ownership persisted shape and integrity validation fail closed', () => {
  const lease = acquirePortableOwnershipLease(request(), null).lease;
  validatePortableOwnershipLease(lease);

  for (const malformed of [
    { ...lease, unexpected: 'metadata' },
    { ...lease, schemaVersion: 2 },
    { ...lease, repositoryIdentity: ' ' },
    { ...lease, projectId: 'x' },
    { ...lease, workItemId: 'x' },
    { ...lease, runId: 'x' },
    { ...lease, leaseId: 'x' },
    { ...lease, generation: 0 },
    { ...lease, machineInstanceId: 'x' },
    { ...lease, acquiredAt: 'invalid' },
    { ...lease, expiresAt: lease.acquiredAt },
    { ...lease, lastCheckpointGeneration: -1 },
    { ...lease, state: 'UNKNOWN' },
    { ...lease, state: 'ACTIVE', releasedAt: lease.acquiredAt },
    { ...lease, state: 'RELEASED', releasedAt: null },
    { ...lease, leaseHash: 'bad' },
    { ...lease, authority: 'SYSTEM_POLICY' },
    { ...lease, leaseHash: '0'.repeat(64) },
  ]) {
    assert.throws(() => validatePortableOwnershipLease(malformed));
  }

  const released = releasePortableOwnershipLease(
    lease,
    lease.leaseId,
    lease.generation,
    '2026-09-25T07:00:10.000Z',
  );
  assert.throws(() =>
    validatePortableOwnershipLease({
      ...released,
      releasedAt: '2026-09-25T06:59:59.999Z',
    }),
  );
});

test('portable ownership remains authority-neutral and active takeover is forbidden', () => {
  assert.equal(portableOwnershipCanTakeOverActiveLease(), false);
  assert.equal(portableMachineInstanceIdCanGrantOwnership(), false);
  assert.equal(portableOwnershipCanGrantAuthority(), false);
});
