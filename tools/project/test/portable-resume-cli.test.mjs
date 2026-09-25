import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquirePortableOwnershipLease,
  releasePortableOwnershipLease,
} from '../../../packages/orchestration/dist/index.js';
import { createResumeManifestV1 } from '../../../packages/persistence/dist/index.js';
import {
  claimPortableResumeOwnership,
  evaluatePortableResumeReconciliation,
  inspectPortableResume,
  inspectPortableResumeWithOwnership,
  publishPreparedResumeCheckpoint,
  publishPreparedResumeHandoff,
  readPreparedResumeManifest,
} from '../lib/portable-resume.mjs';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);
const REMOTE_HEAD = 'a'.repeat(40);

function manifest(overrides = {}) {
  return createResumeManifestV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    activeWorkItemId: 'issue-151',
    issueNumber: 151,
    pullRequestNumber: null,
    branch: 'feature/resume',
    remoteHead: REMOTE_HEAD,
    baseRevision: 'b'.repeat(40),
    workflow: { id: 'project-execution', version: '1.0.0', hash: H1 },
    runSnapshotHash: H2,
    policyHash: H3,
    catalogSnapshotHash: H4,
    bindingSnapshotHash: H5,
    logicalRoleState: { controller: 'READY' },
    completedNodeResults: [],
    parkedDecisionIds: [],
    waitingNodeIds: [],
    readyNodeIds: ['node-ready'],
    artifactManifest: [],
    checkpointHash: H4,
    replayManifestHash: H5,
    workspaceLogicalId: 'workspace-151',
    requiredProviderCapabilities: { 'provider-a': ['reasoning'] },
    requiredSecretHandleIds: ['github.repo.auth'],
    createdAt: '2026-09-25T07:00:00.000Z',
    generation: 1,
    ...overrides,
  });
}

test('portable checkpoint publishes only when repository and remote HEAD are current', async () => {
  const candidate = manifest();
  let publishCalls = 0;
  const store = {
    async publishCas(value, expectedGeneration) {
      publishCalls += 1;
      assert.deepEqual(value, candidate);
      assert.equal(expectedGeneration, null);
      return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
    },
    async getLatest() {
      return candidate;
    },
  };

  const result = await publishPreparedResumeCheckpoint({
    store,
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
  });

  assert.equal(result.status, 'PORTABLE_READY');
  assert.equal(result.published, true);
  assert.equal(result.semanticGatePassInferred, false);
  assert.equal(result.authority, 'NONE');
  assert.equal(publishCalls, 1);
});

test('stale remote HEAD fails reconciliation without publishing', async () => {
  const candidate = manifest();
  let publishCalls = 0;
  const store = {
    async publishCas() {
      publishCalls += 1;
      throw new Error('must not publish stale checkpoint');
    },
  };

  const result = await publishPreparedResumeCheckpoint({
    store,
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: 'c'.repeat(40),
  });

  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.deepEqual(result.errors, ['portable resume remote HEAD is stale']);
  assert.equal(result.published, false);
  assert.equal(publishCalls, 0);
});

test('reconciliation reports repository drift and missing remote branch deterministically', () => {
  const result = evaluatePortableResumeReconciliation({
    manifest: manifest(),
    repositoryIdentity: 'skonyd/other-repository',
    remoteHead: null,
  });

  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.deepEqual(result.errors, [
    'portable resume repository identity mismatch',
    'remote branch feature/resume is missing',
  ]);
  assert.equal(result.authority, 'NONE');
});

test('resume inspection returns not found or currentness result without authority', async () => {
  const candidate = manifest();
  const missing = await inspectPortableResume({
    store: {
      async getLatest() {
        return null;
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async () => {
      throw new Error('must not read product branch without a manifest');
    },
  });
  assert.equal(missing.status, 'NOT_FOUND');
  assert.equal(missing.authority, 'NONE');

  const ready = await inspectPortableResume({
    store: {
      async getLatest() {
        return candidate;
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async (branch) => {
      assert.equal(branch, candidate.branch);
      return REMOTE_HEAD;
    },
  });
  assert.equal(ready.status, 'READY');
  assert.equal(ready.semanticGatePassInferred, false);
  assert.equal(ready.authority, 'NONE');
});

test('prepared manifest file must satisfy the strict persisted contract', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-portable-resume-'));
  try {
    const validFile = path.join(root, 'valid.json');
    const invalidFile = path.join(root, 'invalid.json');
    const candidate = manifest();
    writeFileSync(validFile, JSON.stringify(candidate), 'utf8');
    writeFileSync(
      invalidFile,
      JSON.stringify({ ...candidate, secretValue: 'must-not-persist' }),
      'utf8',
    );

    assert.deepEqual(await readPreparedResumeManifest(validFile), candidate);
    await assert.rejects(() => readPreparedResumeManifest(invalidFile), /unsupported fields/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('portable handoff publishes checkpoint before releasing exact ownership lease', async () => {
  const candidate = manifest();
  const active = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 120_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;
  const events = [];
  let releasedLease = null;

  const result = await publishPreparedResumeHandoff({
    resumeStore: {
      async publishCas(value, expectedGeneration) {
        events.push('resume-publish');
        assert.deepEqual(value, candidate);
        assert.equal(expectedGeneration, null);
        return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
      },
      async getLatest() {
        events.push('resume-read');
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        events.push(releasedLease === null ? 'ownership-read-active' : 'ownership-read-released');
        return {
          lease: releasedLease ?? active,
          revision: releasedLease === null ? 'd'.repeat(40) : 'e'.repeat(40),
          authority: 'NONE',
        };
      },
      async publishCas(value, expectedRevision) {
        events.push('ownership-publish');
        assert.equal(expectedRevision, 'd'.repeat(40));
        assert.equal(value.state, 'RELEASED');
        assert.equal(value.leaseId, active.leaseId);
        releasedLease = value;
        return { status: 'ACCEPT', revision: 'e'.repeat(40), authority: 'NONE' };
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    leaseId: active.leaseId,
    releasedAt: '2026-09-25T07:00:30.000Z',
  });

  assert.equal(result.status, 'PORTABLE_READY');
  assert.equal(result.published, true);
  assert.equal(result.handoffRequested, true);
  assert.equal(result.handoffComplete, true);
  assert.equal(result.ownershipRelease, 'RELEASED');
  assert.equal(result.ownershipRevision, 'e'.repeat(40));
  assert.deepEqual(events, [
    'resume-publish',
    'resume-read',
    'ownership-read-active',
    'ownership-publish',
    'ownership-read-released',
  ]);
});

test('portable handoff never releases ownership when checkpoint reconciliation fails', async () => {
  const candidate = manifest();
  let ownershipCalls = 0;
  const result = await publishPreparedResumeHandoff({
    resumeStore: {
      async publishCas() {
        throw new Error('stale checkpoint must not publish');
      },
    },
    ownershipStore: {
      async getLatest() {
        ownershipCalls += 1;
        throw new Error('ownership must not be touched');
      },
      async publishCas() {
        ownershipCalls += 1;
        throw new Error('ownership must not be touched');
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: 'f'.repeat(40),
    leaseId: 'lease-machine-a',
    releasedAt: '2026-09-25T07:00:30.000Z',
  });

  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.published, false);
  assert.equal(result.handoffComplete, false);
  assert.equal(result.ownershipRelease, 'NOT_ATTEMPTED');
  assert.equal(ownershipCalls, 0);
});

test('portable handoff preserves published checkpoint when ownership CAS conflicts', async () => {
  const candidate = manifest();
  const active = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 120_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;

  const result = await publishPreparedResumeHandoff({
    resumeStore: {
      async publishCas() {
        return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
      },
      async getLatest() {
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        return { lease: active, revision: 'd'.repeat(40), authority: 'NONE' };
      },
      async publishCas() {
        return {
          status: 'CONFLICT',
          reason: 'remote portable ownership state changed during publish',
          revision: null,
          authority: 'NONE',
        };
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    leaseId: active.leaseId,
    releasedAt: '2026-09-25T07:00:30.000Z',
  });

  assert.equal(result.status, 'HANDOFF_CONFLICT');
  assert.equal(result.published, true);
  assert.equal(result.handoffComplete, false);
  assert.equal(result.ownershipRelease, 'CONFLICT');
});

test('portable handoff needs no ownership lease when there is no active work item', async () => {
  const candidate = manifest({ activeWorkItemId: null });
  let ownershipCalls = 0;

  const result = await publishPreparedResumeHandoff({
    resumeStore: {
      async publishCas() {
        return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
      },
      async getLatest() {
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        ownershipCalls += 1;
        return null;
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    leaseId: null,
    releasedAt: '2026-09-25T07:00:30.000Z',
  });

  assert.equal(result.status, 'PORTABLE_READY');
  assert.equal(result.handoffComplete, true);
  assert.equal(result.ownershipRelease, 'NOT_REQUIRED');
  assert.equal(ownershipCalls, 0);
});

test('portable resume blocks a live ownership lease without exact lease continuity', async () => {
  const candidate = manifest();
  const active = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 120_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;

  const result = await inspectPortableResumeWithOwnership({
    resumeStore: {
      async getLatest() {
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        return { lease: active, revision: 'd'.repeat(40), authority: 'NONE' };
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async () => REMOTE_HEAD,
    leaseId: null,
    now: '2026-09-25T07:00:30.000Z',
  });

  assert.equal(result.status, 'OWNERSHIP_ACTIVE');
  assert.equal(result.ownershipStatus, 'ACTIVE_OTHER_OR_UNPROVEN');
  assert.equal(result.readyToMutate, false);
  assert.equal(result.authority, 'NONE');
});

test('portable resume accepts only exact active lease continuity for mutation readiness', async () => {
  const candidate = manifest();
  const active = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 120_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;

  for (const [leaseId, expectedStatus, ready] of [
    ['lease-other', 'OWNERSHIP_ACTIVE', false],
    [active.leaseId, 'READY', true],
  ]) {
    const result = await inspectPortableResumeWithOwnership({
      resumeStore: {
        async getLatest() {
          return candidate;
        },
      },
      ownershipStore: {
        async getLatest() {
          return { lease: active, revision: 'd'.repeat(40), authority: 'NONE' };
        },
      },
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      readRemoteHead: async () => REMOTE_HEAD,
      leaseId,
      now: '2026-09-25T07:00:30.000Z',
    });

    assert.equal(result.status, expectedStatus);
    assert.equal(result.readyToMutate, ready);
    assert.equal(result.ownershipStatus, ready ? 'HELD' : 'ACTIVE_OTHER_OR_UNPROVEN');
    assert.equal(result.authority, 'NONE');
  }
});

test('portable resume requires ownership claim when lease is missing released or expired', async () => {
  const candidate = manifest();
  const active = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 60_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;
  const released = releasePortableOwnershipLease(
    active,
    active.leaseId,
    active.generation,
    '2026-09-25T07:00:30.000Z',
  );

  for (const [stored, now, ownershipStatus] of [
    [null, '2026-09-25T07:00:30.000Z', 'MISSING'],
    [
      { lease: released, revision: 'e'.repeat(40), authority: 'NONE' },
      '2026-09-25T07:00:40.000Z',
      'RELEASED',
    ],
    [
      { lease: active, revision: 'd'.repeat(40), authority: 'NONE' },
      '2026-09-25T07:01:00.000Z',
      'EXPIRED',
    ],
  ]) {
    const result = await inspectPortableResumeWithOwnership({
      resumeStore: {
        async getLatest() {
          return candidate;
        },
      },
      ownershipStore: {
        async getLatest() {
          return stored;
        },
      },
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      readRemoteHead: async () => REMOTE_HEAD,
      leaseId: null,
      now,
    });

    assert.equal(result.status, 'OWNERSHIP_CLAIM_REQUIRED');
    assert.equal(result.ownershipStatus, ownershipStatus);
    assert.equal(result.readyToMutate, false);
  }
});

test('portable resume skips ownership reads when reconciliation is stale or no work is active', async () => {
  let ownershipReads = 0;
  const staleCandidate = manifest();

  const stale = await inspectPortableResumeWithOwnership({
    resumeStore: {
      async getLatest() {
        return staleCandidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        ownershipReads += 1;
        return null;
      },
    },
    repositoryIdentity: staleCandidate.repositoryIdentity,
    projectId: staleCandidate.projectId,
    readRemoteHead: async () => 'f'.repeat(40),
    leaseId: null,
    now: '2026-09-25T07:00:30.000Z',
  });
  assert.equal(stale.status, 'RECONCILIATION_REQUIRED');
  assert.equal(stale.ownershipStatus, 'NOT_CHECKED');
  assert.equal(ownershipReads, 0);

  const idleCandidate = manifest({ activeWorkItemId: null });
  const idle = await inspectPortableResumeWithOwnership({
    resumeStore: {
      async getLatest() {
        return idleCandidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        ownershipReads += 1;
        return null;
      },
    },
    repositoryIdentity: idleCandidate.repositoryIdentity,
    projectId: idleCandidate.projectId,
    readRemoteHead: async () => REMOTE_HEAD,
    leaseId: null,
    now: '2026-09-25T07:00:30.000Z',
  });
  assert.equal(idle.status, 'READY');
  assert.equal(idle.ownershipStatus, 'NOT_REQUIRED');
  assert.equal(idle.readyToMutate, true);
  assert.equal(ownershipReads, 0);
});

test('portable resume claims missing ownership with exact null-revision CAS and read-back', async () => {
  const candidate = manifest();
  const events = [];
  let claimed = null;

  const result = await claimPortableResumeOwnership({
    resumeStore: {
      async getLatest() {
        events.push('resume-read');
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        if (claimed === null) {
          events.push('ownership-read-missing');
          return null;
        }
        events.push('ownership-read-claimed');
        return { lease: claimed, revision: 'e'.repeat(40), authority: 'NONE' };
      },
      async publishCas(value, expectedRevision) {
        events.push('ownership-publish');
        assert.equal(expectedRevision, null);
        claimed = value;
        return { status: 'ACCEPT', revision: 'e'.repeat(40), authority: 'NONE' };
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async () => REMOTE_HEAD,
    runId: 'run-151',
    leaseId: 'lease-machine-b',
    machineInstanceId: 'machine-b',
    ttlMs: 120_000,
    now: '2026-09-25T07:02:00.000Z',
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.ownershipStatus, 'CLAIMED');
  assert.equal(result.ownershipClaimed, true);
  assert.equal(result.reclaimedExpiredLease, false);
  assert.equal(result.ownershipGeneration, 1);
  assert.equal(result.readyToMutate, true);
  assert.equal(result.authority, 'NONE');
  assert.deepEqual(events, [
    'resume-read',
    'ownership-read-missing',
    'ownership-publish',
    'ownership-read-claimed',
  ]);
});

test('portable resume reclaims an expired lease with incremented generation', async () => {
  const candidate = manifest();
  const expired = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 60_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;
  let claimed = null;

  const result = await claimPortableResumeOwnership({
    resumeStore: {
      async getLatest() {
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        return claimed === null
          ? { lease: expired, revision: 'd'.repeat(40), authority: 'NONE' }
          : { lease: claimed, revision: 'e'.repeat(40), authority: 'NONE' };
      },
      async publishCas(value, expectedRevision) {
        assert.equal(expectedRevision, 'd'.repeat(40));
        assert.equal(value.generation, 2);
        assert.equal(value.leaseId, 'lease-machine-b');
        claimed = value;
        return { status: 'ACCEPT', revision: 'e'.repeat(40), authority: 'NONE' };
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async () => REMOTE_HEAD,
    runId: 'run-151',
    leaseId: 'lease-machine-b',
    machineInstanceId: 'machine-b',
    ttlMs: 120_000,
    now: '2026-09-25T07:02:00.000Z',
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.ownershipStatus, 'CLAIMED');
  assert.equal(result.reclaimedExpiredLease, true);
  assert.equal(result.ownershipGeneration, 2);
  assert.equal(result.readyToMutate, true);
});

test('portable resume claim cannot take over a live ownership lease', async () => {
  const candidate = manifest();
  const active = acquirePortableOwnershipLease(
    {
      repositoryIdentity: candidate.repositoryIdentity,
      projectId: candidate.projectId,
      workItemId: candidate.activeWorkItemId,
      runId: 'run-151',
      leaseId: 'lease-machine-a',
      machineInstanceId: 'machine-a',
      now: '2026-09-25T07:00:00.000Z',
      ttlMs: 120_000,
      lastCheckpointGeneration: candidate.generation,
    },
    null,
  ).lease;
  let publishCalls = 0;

  const result = await claimPortableResumeOwnership({
    resumeStore: {
      async getLatest() {
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        return { lease: active, revision: 'd'.repeat(40), authority: 'NONE' };
      },
      async publishCas() {
        publishCalls += 1;
        throw new Error('live ownership must not be overwritten');
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async () => REMOTE_HEAD,
    runId: 'run-151',
    leaseId: 'lease-machine-b',
    machineInstanceId: 'machine-b',
    ttlMs: 120_000,
    now: '2026-09-25T07:00:30.000Z',
  });

  assert.equal(result.status, 'OWNERSHIP_ACTIVE');
  assert.equal(result.ownershipClaimed, false);
  assert.equal(result.readyToMutate, false);
  assert.equal(publishCalls, 0);
});

test('portable resume claim reports exact CAS conflict without guessing takeover', async () => {
  const candidate = manifest();
  let readCount = 0;

  const result = await claimPortableResumeOwnership({
    resumeStore: {
      async getLatest() {
        return candidate;
      },
    },
    ownershipStore: {
      async getLatest() {
        readCount += 1;
        return null;
      },
      async publishCas(value, expectedRevision) {
        assert.equal(value.generation, 1);
        assert.equal(expectedRevision, null);
        return {
          status: 'CONFLICT',
          reason: 'remote portable ownership state changed during publish',
          revision: null,
          authority: 'NONE',
        };
      },
    },
    repositoryIdentity: candidate.repositoryIdentity,
    projectId: candidate.projectId,
    readRemoteHead: async () => REMOTE_HEAD,
    runId: 'run-151',
    leaseId: 'lease-machine-b',
    machineInstanceId: 'machine-b',
    ttlMs: 120_000,
    now: '2026-09-25T07:02:00.000Z',
  });

  assert.equal(result.status, 'OWNERSHIP_CLAIM_CONFLICT');
  assert.equal(result.ownershipStatus, 'CONFLICT');
  assert.equal(result.ownershipClaimed, false);
  assert.equal(result.readyToMutate, false);
  assert.equal(readCount, 1);
});

test('portable resume validates claim inputs before touching ownership state', async () => {
  const candidate = manifest();
  let ownershipReads = 0;

  await assert.rejects(
    () =>
      claimPortableResumeOwnership({
        resumeStore: {
          async getLatest() {
            return candidate;
          },
        },
        ownershipStore: {
          async getLatest() {
            ownershipReads += 1;
            return null;
          },
        },
        repositoryIdentity: candidate.repositoryIdentity,
        projectId: candidate.projectId,
        readRemoteHead: async () => REMOTE_HEAD,
        runId: null,
        leaseId: 'lease-machine-b',
        machineInstanceId: 'machine-b',
        ttlMs: 120_000,
        now: '2026-09-25T07:02:00.000Z',
      }),
    /runId is required/,
  );
  assert.equal(ownershipReads, 0);
});
