import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquirePortableOwnershipLease,
  releasePortableOwnershipLease,
} from '../../../packages/orchestration/dist/index.js';
import {
  createPortableCanonicalEventBundleV1,
  createResumeManifestV1,
  portableEventArtifactId,
} from '../../../packages/persistence/dist/index.js';
import { GitPortableOwnershipStore } from '../lib/portable-ownership-store.mjs';
import {
  buildPortableResumePlan,
  claimPortableResumeOwnership,
  createPortableResumeStore,
  inspectPortableResume,
  publishPreparedResumeHandoff,
  readRemoteBranchHead,
  rebuildPortableResumeReadModel,
} from '../lib/portable-resume.mjs';

const REPOSITORY = 'skonyd/freehighlander-engineering-platform';
const PROJECT_ID = 'project-151';
const WORK_ITEM_ID = 'issue-151';
const RUN_ID = 'run-151';
const BRANCH = 'feature/resume';
const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function currentness() {
  return {
    workflowHash: H1,
    runSnapshotHash: H2,
    policyHash: H3,
    catalogSnapshotHash: H4,
    bindingSnapshotHash: H5,
  };
}

function portableEvents(remoteHead) {
  return createPortableCanonicalEventBundleV1({
    repositoryIdentity: REPOSITORY,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    exactRevision: remoteHead,
    events: [
      {
        schemaVersion: 1,
        type: 'run.started',
        timestamp: '2026-09-25T07:00:00.000Z',
        runId: RUN_ID,
        taskId: 'task-151',
        revision: {
          repository: REPOSITORY,
          pullRequest: 151,
          branch: BRANCH,
          baseSha: remoteHead,
          headSha: remoteHead,
        },
        workflow: {
          id: 'project-execution',
          version: '1.0.0',
          hash: H1,
        },
        payload: {
          portableResumeCurrentness: currentness(),
          checkpoint: 'cross-machine-fixture',
        },
      },
    ],
  });
}

function resumeManifest(remoteHead, events) {
  return createResumeManifestV1({
    repositoryIdentity: REPOSITORY,
    projectId: PROJECT_ID,
    activeWorkItemId: WORK_ITEM_ID,
    issueNumber: 151,
    pullRequestNumber: null,
    branch: BRANCH,
    remoteHead,
    baseRevision: remoteHead,
    workflow: {
      id: 'project-execution',
      version: '1.0.0',
      hash: H1,
    },
    runSnapshotHash: H2,
    policyHash: H3,
    catalogSnapshotHash: H4,
    bindingSnapshotHash: H5,
    logicalRoleState: {
      controller: 'READY',
      reviewer: 'WAITING',
    },
    completedNodeResults: [],
    parkedDecisionIds: [],
    waitingNodeIds: ['node-waiting'],
    readyNodeIds: ['node-ready'],
    artifactManifest: [
      {
        artifactId: portableEventArtifactId(events.runId),
        contentHash: events.bundleHash,
        classification: 'PORTABLE_REQUIRED',
      },
    ],
    checkpointHash: H4,
    replayManifestHash: H5,
    workspaceLogicalId: 'workspace-151',
    requiredProviderCapabilities: {},
    requiredSecretHandleIds: [],
    createdAt: '2026-09-25T07:01:00.000Z',
    generation: 1,
  });
}

async function resumeOnDestination({ repositoryRoot, machineInstanceId, leaseId, now }) {
  const resumeStore = createPortableResumeStore(repositoryRoot);
  const ownershipStore = new GitPortableOwnershipStore(repositoryRoot);

  const inspection = await inspectPortableResume({
    store: resumeStore,
    repositoryIdentity: REPOSITORY,
    projectId: PROJECT_ID,
    readRemoteHead: async (branchName) =>
      readRemoteBranchHead(repositoryRoot, 'origin', branchName),
  });
  assert.equal(inspection.status, 'READY');
  assert.equal(inspection.currentnessStatus, 'VERIFIED');
  assert.equal(inspection.currentnessVerified, true);

  const claimed = await claimPortableResumeOwnership({
    resumeStore,
    ownershipStore,
    repositoryIdentity: REPOSITORY,
    projectId: PROJECT_ID,
    readRemoteHead: async (branchName) =>
      readRemoteBranchHead(repositoryRoot, 'origin', branchName),
    runId: RUN_ID,
    leaseId,
    machineInstanceId,
    ttlMs: 120_000,
    now,
  });
  assert.equal(claimed.status, 'READY');
  assert.equal(claimed.ownershipStatus, 'CLAIMED');
  assert.equal(claimed.readyToMutate, true);

  const manifest = await resumeStore.getLatest(REPOSITORY, PROJECT_ID);
  assert.notEqual(manifest, null);
  const plan = buildPortableResumePlan({
    manifest,
    reconciliation: claimed,
    secrets: {
      status: 'READY',
      blockedHandleIds: [],
      secretDependentWorkReady: true,
      authority: 'NONE',
      secretValuesPresent: false,
    },
  });
  assert.equal(plan.status, 'READY');
  assert.deepEqual(plan.readyNodeIds, ['node-ready']);
  assert.deepEqual(plan.waitingNodeIds, ['node-waiting']);
  assert.equal(plan.canContinueIndependentWork, true);
  assert.equal(plan.localSqliteRequired, false);
  assert.equal(plan.localOnlyCacheRequired, false);

  const readModelFile = path.join(
    repositoryRoot,
    '.freehighlander',
    'runtime',
    'acceptance.sqlite',
  );
  assert.equal(existsSync(readModelFile), false);
  const rebuilt = await rebuildPortableResumeReadModel({
    store: resumeStore,
    repositoryIdentity: REPOSITORY,
    projectId: PROJECT_ID,
    filePath: readModelFile,
  });
  assert.equal(rebuilt.status, 'REBUILT');
  assert.equal(rebuilt.seen, 1);
  assert.equal(rebuilt.imported, 1);
  assert.equal(rebuilt.duplicates, 0);
  assert.equal(existsSync(readModelFile), true);

  const repeated = await rebuildPortableResumeReadModel({
    store: resumeStore,
    repositoryIdentity: REPOSITORY,
    projectId: PROJECT_ID,
    filePath: readModelFile,
  });
  assert.equal(repeated.imported, 0);
  assert.equal(repeated.duplicates, 1);

  return { resumeStore, ownershipStore, claimed, manifest, plan };
}

test('portable resume crosses Linux source to Windows/macOS fixtures with no chat or SQLite handoff', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-cross-machine-'));
  const remote = path.join(root, 'remote.git');
  const source = path.join(root, 'linux-source');
  const windowsDestination = path.join(root, 'windows-fixture');
  const macDestination = path.join(root, 'macos-fixture');

  try {
    runGit(root, ['init', '--bare', remote]);
    runGit(root, ['init', '-b', BRANCH, source]);
    runGit(source, ['config', 'user.name', 'FreeHighlander Test']);
    runGit(source, ['config', 'user.email', 'fh-test@example.invalid']);
    runGit(source, ['commit', '--allow-empty', '-m', 'source checkpoint revision']);
    runGit(source, ['remote', 'add', 'origin', remote]);
    runGit(source, ['push', '-u', 'origin', BRANCH]);

    const remoteHead = runGit(source, ['rev-parse', 'HEAD']);
    const events = portableEvents(remoteHead);
    const manifest = resumeManifest(remoteHead, events);

    const sourceResumeStore = createPortableResumeStore(source);
    const sourceOwnershipStore = new GitPortableOwnershipStore(source);
    const acquired = acquirePortableOwnershipLease(
      {
        repositoryIdentity: REPOSITORY,
        projectId: PROJECT_ID,
        workItemId: WORK_ITEM_ID,
        runId: RUN_ID,
        leaseId: 'lease-linux-source',
        machineInstanceId: 'linux-source',
        now: '2026-09-25T07:00:00.000Z',
        ttlMs: 600_000,
        lastCheckpointGeneration: 0,
      },
      null,
    );
    assert.equal(acquired.status, 'ACQUIRED');
    const acquiredWrite = await sourceOwnershipStore.publishCas(acquired.lease, null);
    assert.equal(acquiredWrite.status, 'ACCEPT');

    const handoff = await publishPreparedResumeHandoff({
      resumeStore: sourceResumeStore,
      ownershipStore: sourceOwnershipStore,
      manifest,
      repositoryIdentity: REPOSITORY,
      remoteHead,
      leaseId: 'lease-linux-source',
      releasedAt: '2026-09-25T07:01:30.000Z',
      eventBundle: events,
    });
    assert.equal(handoff.status, 'PORTABLE_READY');
    assert.equal(handoff.handoffComplete, true);
    assert.equal(handoff.ownershipRelease, 'RELEASED');
    assert.equal(handoff.currentnessStatus, 'VERIFIED');

    const serialized = JSON.stringify({ manifest, events });
    assert.equal(serialized.includes(source), false);
    assert.equal(serialized.includes(windowsDestination), false);
    assert.equal(serialized.includes(macDestination), false);

    runGit(root, ['clone', '--branch', BRANCH, remote, windowsDestination]);
    const windows = await resumeOnDestination({
      repositoryRoot: windowsDestination,
      machineInstanceId: 'windows-fixture',
      leaseId: 'lease-windows-fixture',
      now: '2026-09-25T07:02:00.000Z',
    });
    assert.equal(windows.claimed.ownershipGeneration, 2);

    const windowsCurrent = await windows.ownershipStore.getLatest(
      REPOSITORY,
      PROJECT_ID,
      WORK_ITEM_ID,
    );
    assert.notEqual(windowsCurrent, null);
    const windowsReleased = releasePortableOwnershipLease(
      windowsCurrent.lease,
      'lease-windows-fixture',
      windowsCurrent.lease.generation,
      '2026-09-25T07:03:00.000Z',
    );
    const windowsReleaseWrite = await windows.ownershipStore.publishCas(
      windowsReleased,
      windowsCurrent.revision,
    );
    assert.equal(windowsReleaseWrite.status, 'ACCEPT');

    runGit(root, ['clone', '--branch', BRANCH, remote, macDestination]);
    const mac = await resumeOnDestination({
      repositoryRoot: macDestination,
      machineInstanceId: 'macos-fixture',
      leaseId: 'lease-macos-fixture',
      now: '2026-09-25T07:04:00.000Z',
    });
    assert.equal(mac.claimed.ownershipGeneration, 3);

    runGit(source, ['commit', '--allow-empty', '-m', 'remote drift after checkpoint']);
    runGit(source, ['push', 'origin', BRANCH]);

    const stale = await inspectPortableResume({
      store: mac.resumeStore,
      repositoryIdentity: REPOSITORY,
      projectId: PROJECT_ID,
      readRemoteHead: async (branchName) =>
        readRemoteBranchHead(macDestination, 'origin', branchName),
    });
    assert.equal(stale.status, 'RECONCILIATION_REQUIRED');
    assert.match(stale.errors.join(' '), /remote HEAD is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
