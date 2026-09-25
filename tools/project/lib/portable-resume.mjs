import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';

import { releasePortableOwnershipLease } from '../../../packages/orchestration/dist/index.js';
import {
  GitResumeStore,
  validateResumeManifestV1,
} from '../../../packages/persistence/dist/index.js';

const GIT_OBJECT_ID_PATTERN = /^[a-f0-9]{40,64}$/;

export async function readPreparedResumeManifest(file) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('portable resume manifest contains invalid JSON');
    }
    throw error;
  }
  validateResumeManifestV1(parsed);
  return parsed;
}

export function createPortableResumeStore(root, remote = 'origin') {
  return new GitResumeStore({ repositoryRoot: root, remote });
}

export function evaluatePortableResumeReconciliation({ manifest, repositoryIdentity, remoteHead }) {
  validateResumeManifestV1(manifest);
  const errors = [];

  if (manifest.repositoryIdentity !== repositoryIdentity) {
    errors.push('portable resume repository identity mismatch');
  }
  if (remoteHead === null) {
    errors.push(`remote branch ${manifest.branch} is missing`);
  } else if (remoteHead !== manifest.remoteHead) {
    errors.push('portable resume remote HEAD is stale');
  }

  return {
    status: errors.length === 0 ? 'READY' : 'RECONCILIATION_REQUIRED',
    errors,
    repositoryIdentity,
    projectId: manifest.projectId,
    branch: manifest.branch,
    manifestRemoteHead: manifest.remoteHead,
    currentRemoteHead: remoteHead,
    generation: manifest.generation,
    manifestHash: manifest.manifestHash,
    authority: 'NONE',
  };
}

export async function publishPreparedResumeCheckpoint({
  store,
  manifest,
  repositoryIdentity,
  remoteHead,
}) {
  const reconciliation = evaluatePortableResumeReconciliation({
    manifest,
    repositoryIdentity,
    remoteHead,
  });
  if (reconciliation.status !== 'READY') {
    return {
      ...reconciliation,
      published: false,
      semanticGatePassInferred: false,
    };
  }

  const expectedGeneration = manifest.generation === 1 ? null : manifest.generation - 1;
  const decision = await store.publishCas(manifest, expectedGeneration);
  if (decision.status === 'CONFLICT') {
    return {
      status: 'CONFLICT',
      reasons: decision.reasons,
      repositoryIdentity,
      projectId: manifest.projectId,
      generation: manifest.generation,
      manifestHash: manifest.manifestHash,
      published: false,
      semanticGatePassInferred: false,
      authority: 'NONE',
    };
  }

  const verified = await store.getLatest(repositoryIdentity, manifest.projectId);
  if (verified === null || verified.manifestHash !== manifest.manifestHash) {
    throw new Error('portable resume checkpoint read-back verification failed');
  }

  return {
    status: 'PORTABLE_READY',
    repositoryIdentity,
    projectId: manifest.projectId,
    branch: manifest.branch,
    generation: manifest.generation,
    manifestHash: manifest.manifestHash,
    published: true,
    semanticGatePassInferred: false,
    authority: 'NONE',
  };
}

export async function publishPreparedResumeHandoff({
  resumeStore,
  ownershipStore,
  manifest,
  repositoryIdentity,
  remoteHead,
  leaseId,
  releasedAt,
}) {
  const checkpoint = await publishPreparedResumeCheckpoint({
    store: resumeStore,
    manifest,
    repositoryIdentity,
    remoteHead,
  });
  if (checkpoint.status !== 'PORTABLE_READY') {
    return {
      ...checkpoint,
      handoffRequested: true,
      handoffComplete: false,
      ownershipRelease: 'NOT_ATTEMPTED',
    };
  }

  if (manifest.activeWorkItemId === null) {
    return {
      ...checkpoint,
      handoffRequested: true,
      handoffComplete: true,
      ownershipRelease: 'NOT_REQUIRED',
    };
  }

  if (typeof leaseId !== 'string' || !leaseId.trim()) {
    throw new Error('leaseId is required for active-work handoff');
  }

  const current = await ownershipStore.getLatest(
    repositoryIdentity,
    manifest.projectId,
    manifest.activeWorkItemId,
  );
  if (current === null) {
    return {
      ...checkpoint,
      status: 'HANDOFF_OWNERSHIP_REQUIRED',
      handoffRequested: true,
      handoffComplete: false,
      ownershipRelease: 'NOT_FOUND',
    };
  }

  if (current.lease.state === 'RELEASED') {
    return {
      ...checkpoint,
      handoffRequested: true,
      handoffComplete: true,
      ownershipRelease: 'ALREADY_RELEASED',
      ownershipRevision: current.revision,
    };
  }

  const released = releasePortableOwnershipLease(
    current.lease,
    leaseId,
    current.lease.generation,
    releasedAt,
  );
  const decision = await ownershipStore.publishCas(released, current.revision);
  if (decision.status === 'CONFLICT') {
    return {
      ...checkpoint,
      status: 'HANDOFF_CONFLICT',
      handoffRequested: true,
      handoffComplete: false,
      ownershipRelease: 'CONFLICT',
    };
  }

  const verified = await ownershipStore.getLatest(
    repositoryIdentity,
    manifest.projectId,
    manifest.activeWorkItemId,
  );
  if (
    verified === null ||
    verified.revision !== decision.revision ||
    verified.lease.state !== 'RELEASED' ||
    verified.lease.leaseHash !== released.leaseHash
  ) {
    throw new Error('portable ownership handoff read-back verification failed');
  }

  return {
    ...checkpoint,
    handoffRequested: true,
    handoffComplete: true,
    ownershipRelease: 'RELEASED',
    ownershipRevision: decision.revision,
  };
}

export async function inspectPortableResume({
  store,
  repositoryIdentity,
  projectId,
  readRemoteHead,
}) {
  const manifest = await store.getLatest(repositoryIdentity, projectId);
  if (manifest === null) {
    return {
      status: 'NOT_FOUND',
      repositoryIdentity,
      projectId,
      semanticGatePassInferred: false,
      authority: 'NONE',
    };
  }

  const remoteHead = await readRemoteHead(manifest.branch);
  return {
    ...evaluatePortableResumeReconciliation({
      manifest,
      repositoryIdentity,
      remoteHead,
    }),
    semanticGatePassInferred: false,
  };
}

export function readRemoteBranchHead(root, remote, branch) {
  requireRemoteName(remote);
  requireBranchName(root, branch);

  const output = runGit(root, ['ls-remote', '--refs', remote, `refs/heads/${branch}`]);
  if (!output.trim()) return null;

  const parts = output.trim().split(/\s+/);
  if (
    parts.length !== 2 ||
    parts[1] !== `refs/heads/${branch}` ||
    !GIT_OBJECT_ID_PATTERN.test(parts[0] ?? '')
  ) {
    throw new Error('remote branch lookup returned malformed ref data');
  }
  return parts[0];
}

export function readCheckpointWorktreeStatus(root) {
  return runGit(root, ['status', '--porcelain']);
}

function requireRemoteName(remote) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(remote)) {
    throw new Error('remote must be a bounded Git remote name');
  }
}

function requireBranchName(root, branch) {
  if (!branch || branch.length > 255 || /[\r\n\0]/.test(branch)) {
    throw new Error('portable resume branch is invalid');
  }
  try {
    runGit(root, ['check-ref-format', '--branch', branch]);
  } catch {
    throw new Error('portable resume branch is invalid');
  }
}

function runGit(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
