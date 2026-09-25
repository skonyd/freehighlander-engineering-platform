import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  acquirePortableOwnershipLease,
  portableOwnershipLeaseIsActive,
  releasePortableOwnershipLease,
} from '../../../packages/orchestration/dist/index.js';
import {
  GitResumeStore,
  rebuildSqliteReadModelFromPortableEventBundle,
  validatePortableCanonicalEventBundleV1,
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

export async function readPreparedPortableEventBundle(file) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('portable event bundle contains invalid JSON');
    }
    throw error;
  }
  validatePortableCanonicalEventBundleV1(parsed);
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
  eventBundle = null,
}) {
  const reconciliation = evaluatePortableResumeReconciliation({
    manifest,
    repositoryIdentity,
    remoteHead,
    eventBundle,
  });
  if (reconciliation.status !== 'READY') {
    return {
      ...reconciliation,
      published: false,
      semanticGatePassInferred: false,
    };
  }

  const expectedGeneration = manifest.generation === 1 ? null : manifest.generation - 1;
  const decision =
    eventBundle === null
      ? await store.publishCas(manifest, expectedGeneration)
      : typeof store.publishCasWithEventBundle === 'function'
        ? await store.publishCasWithEventBundle(manifest, eventBundle, expectedGeneration)
        : (() => {
            throw new Error('portable resume store does not support event bundle publication');
          })();
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

  let eventBundleHash = null;
  if (eventBundle !== null) {
    if (typeof store.getLatestEventBundle !== 'function') {
      throw new Error('portable resume store does not support event bundle read-back');
    }
    const verifiedBundle = await store.getLatestEventBundle(repositoryIdentity, manifest.projectId);
    if (verifiedBundle === null || verifiedBundle.bundleHash !== eventBundle.bundleHash) {
      throw new Error('portable event bundle checkpoint read-back verification failed');
    }
    eventBundleHash = verifiedBundle.bundleHash;
  }

  return {
    status: 'PORTABLE_READY',
    repositoryIdentity,
    projectId: manifest.projectId,
    branch: manifest.branch,
    generation: manifest.generation,
    manifestHash: manifest.manifestHash,
    eventBundleHash,
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
  eventBundle = null,
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

export async function inspectPortableResumeWithOwnership({
  resumeStore,
  ownershipStore,
  repositoryIdentity,
  projectId,
  readRemoteHead,
  leaseId,
  now,
}) {
  const manifest = await resumeStore.getLatest(repositoryIdentity, projectId);
  if (manifest === null) {
    return {
      status: 'NOT_FOUND',
      repositoryIdentity,
      projectId,
      ownershipStatus: 'NOT_CHECKED',
      readyToMutate: false,
      semanticGatePassInferred: false,
      authority: 'NONE',
    };
  }

  const remoteHead = await readRemoteHead(manifest.branch);
  const reconciliation = evaluatePortableResumeReconciliation({
    manifest,
    repositoryIdentity,
    remoteHead,
  });
  if (reconciliation.status !== 'READY') {
    return {
      ...reconciliation,
      ownershipStatus: 'NOT_CHECKED',
      readyToMutate: false,
      semanticGatePassInferred: false,
    };
  }

  if (manifest.activeWorkItemId === null) {
    return {
      ...reconciliation,
      ownershipStatus: 'NOT_REQUIRED',
      readyToMutate: true,
      semanticGatePassInferred: false,
    };
  }

  const ownership = await ownershipStore.getLatest(
    repositoryIdentity,
    manifest.projectId,
    manifest.activeWorkItemId,
  );
  if (ownership === null) {
    return {
      ...reconciliation,
      status: 'OWNERSHIP_CLAIM_REQUIRED',
      ownershipStatus: 'MISSING',
      readyToMutate: false,
      semanticGatePassInferred: false,
    };
  }

  if (portableOwnershipLeaseIsActive(ownership.lease, now)) {
    if (typeof leaseId === 'string' && leaseId === ownership.lease.leaseId) {
      return {
        ...reconciliation,
        ownershipStatus: 'HELD',
        ownershipRevision: ownership.revision,
        ownershipGeneration: ownership.lease.generation,
        readyToMutate: true,
        semanticGatePassInferred: false,
      };
    }
    return {
      ...reconciliation,
      status: 'OWNERSHIP_ACTIVE',
      ownershipStatus: 'ACTIVE_OTHER_OR_UNPROVEN',
      ownershipRevision: ownership.revision,
      ownershipGeneration: ownership.lease.generation,
      readyToMutate: false,
      semanticGatePassInferred: false,
    };
  }

  return {
    ...reconciliation,
    status: 'OWNERSHIP_CLAIM_REQUIRED',
    ownershipStatus: ownership.lease.state === 'RELEASED' ? 'RELEASED' : 'EXPIRED',
    ownershipRevision: ownership.revision,
    ownershipGeneration: ownership.lease.generation,
    readyToMutate: false,
    semanticGatePassInferred: false,
  };
}

export async function claimPortableResumeOwnership({
  resumeStore,
  ownershipStore,
  repositoryIdentity,
  projectId,
  readRemoteHead,
  runId,
  leaseId,
  machineInstanceId,
  ttlMs,
  now,
}) {
  const manifest = await resumeStore.getLatest(repositoryIdentity, projectId);
  if (manifest === null) {
    return {
      status: 'NOT_FOUND',
      repositoryIdentity,
      projectId,
      ownershipStatus: 'NOT_CHECKED',
      ownershipClaimed: false,
      readyToMutate: false,
      semanticGatePassInferred: false,
      authority: 'NONE',
    };
  }

  const remoteHead = await readRemoteHead(manifest.branch);
  const reconciliation = evaluatePortableResumeReconciliation({
    manifest,
    repositoryIdentity,
    remoteHead,
  });
  if (reconciliation.status !== 'READY') {
    return {
      ...reconciliation,
      ownershipStatus: 'NOT_CHECKED',
      ownershipClaimed: false,
      readyToMutate: false,
      semanticGatePassInferred: false,
    };
  }

  if (manifest.activeWorkItemId === null) {
    return {
      ...reconciliation,
      ownershipStatus: 'NOT_REQUIRED',
      ownershipClaimed: false,
      readyToMutate: true,
      semanticGatePassInferred: false,
    };
  }

  for (const [value, name] of [
    [runId, 'runId'],
    [leaseId, 'leaseId'],
    [machineInstanceId, 'machineInstanceId'],
  ]) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(name + ' is required for ownership claim');
    }
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('ttlMs must be a positive safe integer for ownership claim');
  }

  const current = await ownershipStore.getLatest(
    repositoryIdentity,
    manifest.projectId,
    manifest.activeWorkItemId,
  );
  const acquisition = acquirePortableOwnershipLease(
    {
      repositoryIdentity,
      projectId: manifest.projectId,
      workItemId: manifest.activeWorkItemId,
      runId,
      leaseId,
      machineInstanceId,
      now,
      ttlMs,
      lastCheckpointGeneration: manifest.generation,
    },
    current?.lease ?? null,
  );
  if (acquisition.status === 'BLOCKED_ACTIVE') {
    return {
      ...reconciliation,
      status: 'OWNERSHIP_ACTIVE',
      ownershipStatus: 'ACTIVE_OTHER',
      ownershipClaimed: false,
      ownershipRevision: current?.revision ?? null,
      ownershipGeneration: acquisition.lease.generation,
      readyToMutate: false,
      semanticGatePassInferred: false,
    };
  }

  const decision = await ownershipStore.publishCas(acquisition.lease, current?.revision ?? null);
  if (decision.status === 'CONFLICT') {
    return {
      ...reconciliation,
      status: 'OWNERSHIP_CLAIM_CONFLICT',
      ownershipStatus: 'CONFLICT',
      ownershipClaimed: false,
      readyToMutate: false,
      semanticGatePassInferred: false,
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
    verified.lease.state !== 'ACTIVE' ||
    verified.lease.leaseHash !== acquisition.lease.leaseHash
  ) {
    throw new Error('portable ownership claim read-back verification failed');
  }

  return {
    ...reconciliation,
    ownershipStatus: 'CLAIMED',
    ownershipClaimed: true,
    reclaimedExpiredLease: acquisition.reclaimedExpiredLease,
    ownershipRevision: decision.revision,
    ownershipGeneration: acquisition.lease.generation,
    readyToMutate: true,
    semanticGatePassInferred: false,
  };
}

export async function rebuildPortableResumeReadModel({
  store,
  repositoryIdentity,
  projectId,
  filePath,
}) {
  if (!store || typeof store.getLatestEventBundle !== 'function') {
    throw new Error('portable resume store does not support event bundle retrieval');
  }
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('portable resume read-model filePath is required');
  }

  const bundle = await store.getLatestEventBundle(repositoryIdentity, projectId);
  if (bundle === null) {
    return {
      status: 'NOT_REQUIRED',
      projectId,
      eventBundleHash: null,
      imported: 0,
      duplicates: 0,
      localDatabaseRequiredForPortability: false,
      semanticGatePassInferred: false,
      authority: 'NONE',
    };
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const rebuilt = rebuildSqliteReadModelFromPortableEventBundle(bundle, filePath);
  return {
    status: 'REBUILT',
    projectId,
    eventBundleHash: rebuilt.bundleHash,
    imported: rebuilt.imported,
    duplicates: rebuilt.duplicates,
    integrity: rebuilt.integrity,
    localDatabaseRequiredForPortability: false,
    semanticGatePassInferred: false,
    authority: 'NONE',
  };
}

export async function resolvePortableResumeProjectId(store, requestedProjectId) {
  if (requestedProjectId !== null && requestedProjectId !== undefined) {
    if (
      typeof requestedProjectId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(requestedProjectId)
    ) {
      throw new Error('portable resume project id must be a bounded identifier');
    }
    return requestedProjectId;
  }

  if (!store || typeof store.listProjectIds !== 'function') {
    throw new Error('portable resume store does not support project discovery');
  }
  const projectIds = await store.listProjectIds();
  if (projectIds.length === 0) {
    throw new Error('no portable resume project state found on the remote');
  }
  if (projectIds.length > 1) {
    throw new Error(
      'multiple portable resume projects found; use --project: ' + projectIds.join(', '),
    );
  }
  return projectIds[0];
}

export function buildPortableResumePlan({ manifest, reconciliation, secrets }) {
  validateResumeManifestV1(manifest);
  if (reconciliation === null || typeof reconciliation !== 'object') {
    throw new Error('portable resume reconciliation result is required');
  }
  if (secrets === null || typeof secrets !== 'object') {
    throw new Error('portable resume secret readiness result is required');
  }

  const parkedDecisionIds = [...manifest.parkedDecisionIds];
  const readyNodeIds = [...manifest.readyNodeIds];
  const waitingNodeIds = [...manifest.waitingNodeIds];
  const completedNodeIds = manifest.completedNodeResults.map((entry) => entry.nodeId).sort();
  const secretBlockedHandleIds = Array.isArray(secrets.blockedHandleIds)
    ? [...secrets.blockedHandleIds].sort()
    : [];

  const reconciliationReady =
    reconciliation.status === 'READY' && reconciliation.readyToMutate === true;
  const status = !reconciliationReady
    ? 'RECONCILIATION_REQUIRED'
    : readyNodeIds.length > 0
      ? 'READY'
      : parkedDecisionIds.length > 0 || waitingNodeIds.length > 0
        ? 'BLOCKED'
        : 'IDLE';

  return {
    status,
    repositoryIdentity: manifest.repositoryIdentity,
    projectId: manifest.projectId,
    branch: manifest.branch,
    generation: manifest.generation,
    manifestHash: manifest.manifestHash,
    checkpointHash: manifest.checkpointHash,
    replayManifestHash: manifest.replayManifestHash,
    parkedDecisionIds,
    readyNodeIds,
    waitingNodeIds,
    completedNodeIds,
    secretBlockedHandleIds,
    secretDependentWorkReady: secrets.secretDependentWorkReady === true,
    canContinueIndependentWork: reconciliationReady && readyNodeIds.length > 0,
    localSqliteRequired: false,
    localOnlyCacheRequired: false,
    semanticGatePassInferred: false,
    authority: 'NONE',
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
