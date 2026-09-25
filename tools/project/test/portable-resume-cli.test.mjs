import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { acquirePortableOwnershipLease } from '../../../packages/orchestration/dist/index.js';
import { createResumeManifestV1 } from '../../../packages/persistence/dist/index.js';
import {
  evaluatePortableResumeReconciliation,
  inspectPortableResume,
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
