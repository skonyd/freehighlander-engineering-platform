import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquirePortableOwnershipLease,
  buildCanonicalExecutionScope,
  buildNodeExecutionIdentity,
  createHumanDecisionQueueEntry,
  createNodeResultV1,
  evaluateNodeResultReuse,
  releasePortableOwnershipLease,
} from '../../../packages/orchestration/dist/index.js';
import {
  createPortableCanonicalEventBundleV1,
  createResumeManifestV1,
  portableEventArtifactId,
} from '../../../packages/persistence/dist/index.js';
import {
  buildPortableResumePlan,
  claimPortableResumeOwnership,
  evaluatePortableResumeCurrentnessEvidence,
  evaluatePortableResumeReconciliation,
  inspectPortableResume,
  inspectPortableResumeWithOwnership,
  publishPreparedResumeCheckpoint,
  publishPreparedResumeHandoff,
  readPreparedPortableEventBundle,
  readPreparedResumeManifest,
  rebuildPortableResumeReadModel,
  restorePortableCompletedNodeResults,
  restorePortableHumanDecisionQueue,
  resolvePortableResumeProjectId,
} from '../lib/portable-resume.mjs';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);
const H6 = '6'.repeat(64);
const H7 = '7'.repeat(64);
const H8 = '8'.repeat(64);
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

function portableResumeCurrentness(overrides = {}) {
  return {
    workflowHash: H1,
    runSnapshotHash: H2,
    policyHash: H3,
    catalogSnapshotHash: H4,
    bindingSnapshotHash: H5,
    ...overrides,
  };
}

function portableEventBundle() {
  return createPortableCanonicalEventBundleV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    runId: 'run-151',
    exactRevision: REMOTE_HEAD,
    events: [
      {
        schemaVersion: 1,
        type: 'run.started',
        timestamp: '2026-09-25T07:00:00.000Z',
        runId: 'run-151',
        taskId: 'task-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          pullRequest: 151,
          branch: 'feature/resume',
          baseSha: 'b'.repeat(40),
          headSha: REMOTE_HEAD,
        },
        workflow: {
          id: 'project-execution',
          version: '1.0.0',
          hash: H1,
        },
        payload: {
          checkpoint: 'portable',
          portableResumeCurrentness: portableResumeCurrentness(),
        },
      },
    ],
  });
}

function manifestWithPortableEvents(bundle = portableEventBundle()) {
  return manifest({
    artifactManifest: [
      {
        artifactId: portableEventArtifactId(bundle.runId),
        contentHash: bundle.bundleHash,
        classification: 'PORTABLE_REQUIRED',
      },
    ],
  });
}

function exactHumanDecision(overrides = {}) {
  return createHumanDecisionQueueEntry({
    decisionId: 'decision-017',
    projectId: 'project-151',
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    workItemId: 'issue-151',
    runId: 'run-151',
    nodeId: 'human-gate',
    exactRevision: REMOTE_HEAD,
    scopeHash: H6,
    currentness: {
      workflowHash: H1,
      runSnapshotHash: H2,
      policyHash: H3,
      catalogSnapshotHash: H4,
      bindingSnapshotHash: H5,
      dependencyGraphHash: H7,
    },
    decisionType: 'OPERATOR_APPROVAL',
    reason: 'Protected continuation requires human approval.',
    choices: ['approve', 'reject'],
    consequences: ['approve resumes the parked branch', 'reject leaves it parked'],
    evidenceHashes: [H1, H2],
    createdAt: '2026-09-25T07:00:01.000Z',
    blockedWorkItemIds: ['issue-152'],
    otherWorkContinuing: true,
    ...overrides,
  });
}

function portableHumanDecisionBundle(entry = exactHumanDecision()) {
  return createPortableCanonicalEventBundleV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    runId: 'run-151',
    exactRevision: REMOTE_HEAD,
    events: [
      {
        schemaVersion: 1,
        type: 'human.required',
        timestamp: '2026-09-25T07:00:01.000Z',
        runId: 'run-151',
        taskId: 'task-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          pullRequest: 151,
          branch: 'feature/resume',
          baseSha: 'b'.repeat(40),
          headSha: REMOTE_HEAD,
        },
        workflow: {
          id: 'project-execution',
          version: '1.0.0',
          hash: H1,
        },
        node: {
          id: entry.nodeId,
          type: 'HUMAN',
        },
        payload: {
          portableHumanDecisionQueueEntry: entry,
          portableResumeCurrentness: portableResumeCurrentness(),
        },
      },
    ],
  });
}

function manifestWithParkedDecision(entry, bundle) {
  return manifest({
    parkedDecisionIds: [entry.decisionId],
    readyNodeIds: ['node-independent'],
    artifactManifest: [
      {
        artifactId: portableEventArtifactId(bundle.runId),
        contentHash: bundle.bundleHash,
        classification: 'PORTABLE_REQUIRED',
      },
    ],
  });
}

function exactNodeResult(overrides = {}) {
  const scope = buildCanonicalExecutionScope({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    exactRevision: REMOTE_HEAD,
    runSnapshotHash: H2,
    components: {
      binding: H4,
      policy: H3,
      prompt: H5,
    },
  });
  const identity = buildNodeExecutionIdentity({
    runSnapshotHash: H2,
    nodeId: 'node-review',
    nodeVersion: '1.0.0',
    exactRevision: REMOTE_HEAD,
    scopeHash: scope.scopeHash,
    inputHash: H1,
    roleContractHash: H4,
    promptContractHash: H5,
    bindingId: 'binding-primary',
    providerId: 'provider-a',
    modelId: 'model-a',
    effort: 'medium',
    policyHash: H3,
    configHash: H4,
    predecessorResultHashes: [],
    artifactHashes: [],
    ...overrides,
  });
  return createNodeResultV1({
    identity,
    status: 'SUCCEEDED',
    outputHash: H5,
    artifactHashes: [],
  });
}

function portableNodeResultBundle(result = exactNodeResult()) {
  return createPortableCanonicalEventBundleV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    runId: 'run-151',
    exactRevision: REMOTE_HEAD,
    events: [
      {
        schemaVersion: 1,
        type: 'node.completed',
        timestamp: '2026-09-25T07:00:00.000Z',
        runId: 'run-151',
        taskId: 'task-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          pullRequest: 151,
          branch: 'feature/resume',
          baseSha: 'b'.repeat(40),
          headSha: REMOTE_HEAD,
        },
        workflow: {
          id: 'project-execution',
          version: '1.0.0',
          hash: H1,
        },
        node: {
          id: result.identity.nodeId,
          type: 'MODEL',
        },
        payload: {
          portableNodeResult: result,
          portableResumeCurrentness: portableResumeCurrentness(),
        },
      },
    ],
  });
}

function manifestWithCompletedNodeResult(result, bundle) {
  return manifest({
    completedNodeResults: [
      {
        nodeId: result.identity.nodeId,
        resultHash: result.resultHash,
        executionKey: result.identity.executionKey,
      },
    ],
    artifactManifest: [
      {
        artifactId: portableEventArtifactId(bundle.runId),
        contentHash: bundle.bundleHash,
        classification: 'PORTABLE_REQUIRED',
      },
    ],
  });
}

test('portable human decision queue restores exact parked metadata across machines', () => {
  const entry = exactHumanDecision();
  const bundle = portableHumanDecisionBundle(entry);
  const candidate = manifestWithParkedDecision(entry, bundle);

  const restored = restorePortableHumanDecisionQueue({
    manifest: candidate,
    eventBundle: bundle,
  });

  assert.equal(restored.status, 'RESTORED');
  assert.deepEqual(restored.restoredDecisionIds, ['decision-017']);
  assert.equal(restored.decisionCount, 1);
  assert.deepEqual(restored.entries, [entry]);
  assert.equal(restored.semanticGatePassInferred, false);
  assert.equal(restored.authority, 'NONE');
});

test('portable parked decisions require full event metadata and exact currentness', () => {
  const entry = exactHumanDecision();
  const bundle = portableHumanDecisionBundle(entry);
  const candidate = manifestWithParkedDecision(entry, bundle);

  assert.throws(
    () => restorePortableHumanDecisionQueue({ manifest: candidate, eventBundle: null }),
    /require an event bundle/,
  );

  const metadataMissingBundle = portableEventBundle();
  const metadataMissingManifest = manifestWithParkedDecision(entry, metadataMissingBundle);
  assert.throws(
    () =>
      restorePortableHumanDecisionQueue({
        manifest: metadataMissingManifest,
        eventBundle: metadataMissingBundle,
      }),
    /human decision is missing/,
  );

  const staleEntry = exactHumanDecision({
    currentness: {
      ...entry.currentness,
      policyHash: H8,
    },
  });
  const staleBundle = portableHumanDecisionBundle(staleEntry);
  const staleManifest = manifestWithParkedDecision(staleEntry, staleBundle);
  assert.throws(
    () =>
      restorePortableHumanDecisionQueue({
        manifest: staleManifest,
        eventBundle: staleBundle,
      }),
    /policy mismatch/,
  );
});

test('portable checkpoint refuses parked decision ids without exact portable queue entries', async () => {
  const entry = exactHumanDecision();
  const bundle = portableHumanDecisionBundle(entry);
  const candidate = manifestWithParkedDecision(entry, bundle);

  const accepted = await publishPreparedResumeCheckpoint({
    store: {
      async publishCasWithEventBundle() {
        return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
      },
      async getLatest() {
        return candidate;
      },
      async getLatestEventBundle() {
        return bundle;
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    eventBundle: bundle,
  });

  assert.equal(accepted.status, 'PORTABLE_READY');
  assert.equal(accepted.parkedDecisionCount, 1);
  assert.deepEqual(accepted.parkedDecisionIds, ['decision-017']);

  await assert.rejects(
    () =>
      publishPreparedResumeCheckpoint({
        store: {
          async publishCas() {
            throw new Error('must not publish incomplete parked decision state');
          },
        },
        manifest: candidate,
        repositoryIdentity: candidate.repositoryIdentity,
        remoteHead: REMOTE_HEAD,
        eventBundle: null,
      }),
    /parked human decisions require an event bundle/,
  );
});

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

test('portable checkpoint publishes and verifies the manifest-bound event bundle', async () => {
  const bundle = portableEventBundle();
  const candidate = manifestWithPortableEvents(bundle);
  const calls = [];

  const result = await publishPreparedResumeCheckpoint({
    store: {
      async publishCasWithEventBundle(value, events, expectedGeneration) {
        calls.push('publish-events');
        assert.deepEqual(value, candidate);
        assert.deepEqual(events, bundle);
        assert.equal(expectedGeneration, null);
        return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
      },
      async getLatest() {
        calls.push('manifest-read');
        return candidate;
      },
      async getLatestEventBundle() {
        calls.push('events-read');
        return bundle;
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    eventBundle: bundle,
  });

  assert.equal(result.status, 'PORTABLE_READY');
  assert.equal(result.eventBundleHash, bundle.bundleHash);
  assert.equal(result.published, true);
  assert.equal(result.semanticGatePassInferred, false);
  assert.deepEqual(calls, ['publish-events', 'manifest-read', 'events-read']);
});

test('portable handoff never releases ownership before event bundle read-back verifies', async () => {
  const bundle = portableEventBundle();
  const candidate = manifestWithPortableEvents(bundle);
  let ownershipReads = 0;

  await assert.rejects(
    () =>
      publishPreparedResumeHandoff({
        resumeStore: {
          async publishCasWithEventBundle() {
            return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
          },
          async getLatest() {
            return candidate;
          },
          async getLatestEventBundle() {
            return { ...bundle, bundleHash: 'f'.repeat(64) };
          },
        },
        ownershipStore: {
          async getLatest() {
            ownershipReads += 1;
            throw new Error('ownership must not be touched before event verification');
          },
        },
        manifest: candidate,
        repositoryIdentity: candidate.repositoryIdentity,
        remoteHead: REMOTE_HEAD,
        leaseId: 'lease-machine-a',
        releasedAt: '2026-09-25T07:00:30.000Z',
        eventBundle: bundle,
      }),
    /event bundle checkpoint read-back verification failed/,
  );
  assert.equal(ownershipReads, 0);
});

test('completed NodeResult checkpoint requires portable full metadata and restores exact reuse', async () => {
  const result = exactNodeResult();
  const bundle = portableNodeResultBundle(result);
  const candidate = manifestWithCompletedNodeResult(result, bundle);

  await assert.rejects(
    () =>
      publishPreparedResumeCheckpoint({
        store: {
          async publishCas() {
            throw new Error('manifest-only completed results must not publish');
          },
        },
        manifest: candidate,
        repositoryIdentity: candidate.repositoryIdentity,
        remoteHead: REMOTE_HEAD,
      }),
    /completed portable NodeResults require an event bundle/,
  );

  const checkpoint = await publishPreparedResumeCheckpoint({
    store: {
      async publishCasWithEventBundle(value, events, expectedGeneration) {
        assert.deepEqual(value, candidate);
        assert.deepEqual(events, bundle);
        assert.equal(expectedGeneration, null);
        return { status: 'ACCEPT', reasons: [], acceptedGeneration: 1, authority: 'NONE' };
      },
      async getLatest() {
        return candidate;
      },
      async getLatestEventBundle() {
        return bundle;
      },
    },
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    eventBundle: bundle,
  });

  assert.equal(checkpoint.status, 'PORTABLE_READY');
  assert.equal(checkpoint.restoredNodeResultCount, 1);
  assert.deepEqual(checkpoint.restoredNodeIds, ['node-review']);

  const restored = restorePortableCompletedNodeResults({
    manifest: candidate,
    eventBundle: bundle,
  });
  assert.equal(restored.status, 'RESTORED');
  assert.equal(restored.resultCount, 1);
  assert.deepEqual(restored.restoredNodeIds, ['node-review']);

  let providerCalls = 0;
  const reuse = evaluateNodeResultReuse(restored.results[0], {
    expectedIdentity: result.identity,
    sideEffecting: false,
  });
  if (reuse.status !== 'REUSABLE') providerCalls += 1;

  assert.equal(reuse.status, 'REUSABLE');
  assert.equal(providerCalls, 0);
  assert.equal(restored.semanticGatePassInferred, false);
  assert.equal(restored.authority, 'NONE');
});

test('portable completed NodeResult restore rejects missing extra and stale identities', () => {
  const result = exactNodeResult();
  const bundle = portableNodeResultBundle(result);
  const candidate = manifestWithCompletedNodeResult(result, bundle);

  const missingBundle = createPortableCanonicalEventBundleV1({
    repositoryIdentity: bundle.repositoryIdentity,
    projectId: bundle.projectId,
    runId: bundle.runId,
    exactRevision: bundle.exactRevision,
    events: [],
  });
  assert.throws(
    () =>
      restorePortableCompletedNodeResults({
        manifest: candidate,
        eventBundle: missingBundle,
      }),
    /completed NodeResult is missing/,
  );

  const staleResult = exactNodeResult({ policyHash: H4 });
  const staleBundle = portableNodeResultBundle(staleResult);
  assert.throws(
    () =>
      restorePortableCompletedNodeResults({
        manifest: candidate,
        eventBundle: staleBundle,
      }),
    /policy mismatch|identity mismatch/,
  );

  const extraResult = exactNodeResult({ nodeId: 'node-extra' });
  const extraBundle = portableNodeResultBundle(extraResult);
  assert.throws(
    () =>
      restorePortableCompletedNodeResults({
        manifest: candidate,
        eventBundle: extraBundle,
      }),
    /unlisted completed NodeResult/,
  );
});

test('exact reuse turns stale when the destination execution identity changes', () => {
  const result = exactNodeResult();
  const changed = buildNodeExecutionIdentity({
    runSnapshotHash: result.identity.runSnapshotHash,
    nodeId: result.identity.nodeId,
    nodeVersion: result.identity.nodeVersion,
    exactRevision: result.identity.exactRevision,
    scopeHash: result.identity.scopeHash,
    inputHash: result.identity.inputHash,
    roleContractHash: result.identity.roleContractHash,
    promptContractHash: result.identity.promptContractHash,
    bindingId: 'binding-alternate',
    providerId: result.identity.providerId,
    modelId: result.identity.modelId,
    effort: result.identity.effort,
    policyHash: result.identity.policyHash,
    configHash: result.identity.configHash,
    predecessorResultHashes: result.identity.predecessorResultHashes,
    artifactHashes: result.identity.artifactHashes,
  });

  const reuse = evaluateNodeResultReuse(result, {
    expectedIdentity: changed,
    sideEffecting: false,
  });
  assert.equal(reuse.status, 'STALE');
  assert.deepEqual(reuse.reasons, ['execution identity mismatch']);
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

test('prepared portable event bundle is strict and read-model rebuild is idempotent', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fh-portable-read-model-'));
  try {
    const bundle = portableEventBundle();
    const bundleFile = path.join(root, 'events.json');
    const invalidFile = path.join(root, 'invalid-events.json');
    const dbFile = path.join(root, 'nested', 'read-model.sqlite');
    writeFileSync(bundleFile, JSON.stringify(bundle), 'utf8');
    writeFileSync(invalidFile, JSON.stringify({ ...bundle, authority: 'MERGE' }), 'utf8');

    assert.deepEqual(await readPreparedPortableEventBundle(bundleFile), bundle);
    await assert.rejects(
      () => readPreparedPortableEventBundle(invalidFile),
      /authority must be NONE/,
    );

    const store = {
      async getLatestEventBundle() {
        return bundle;
      },
    };
    const first = await rebuildPortableResumeReadModel({
      store,
      repositoryIdentity: bundle.repositoryIdentity,
      projectId: bundle.projectId,
      filePath: dbFile,
    });
    assert.equal(first.status, 'REBUILT');
    assert.equal(first.imported, 1);
    assert.equal(first.duplicates, 0);
    assert.equal(first.integrity.ok, true);
    assert.equal(first.localDatabaseRequiredForPortability, false);

    const second = await rebuildPortableResumeReadModel({
      store,
      repositoryIdentity: bundle.repositoryIdentity,
      projectId: bundle.projectId,
      filePath: dbFile,
    });
    assert.equal(second.status, 'REBUILT');
    assert.equal(second.imported, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(second.eventBundleHash, bundle.bundleHash);

    const none = await rebuildPortableResumeReadModel({
      store: {
        async getLatestEventBundle() {
          return null;
        },
      },
      repositoryIdentity: bundle.repositoryIdentity,
      projectId: bundle.projectId,
      filePath: path.join(root, 'not-created.sqlite'),
    });
    assert.equal(none.status, 'NOT_REQUIRED');
    assert.equal(none.localDatabaseRequiredForPortability, false);
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

test('portable resume planner reconstructs actionable state without local SQLite or cache', () => {
  const candidate = manifest({
    parkedDecisionIds: ['decision-017'],
    waitingNodeIds: ['node-waiting'],
    readyNodeIds: ['node-ready-b', 'node-ready-a'],
    completedNodeResults: [
      {
        nodeId: 'node-complete',
        resultHash: '6'.repeat(64),
        executionKey: '7'.repeat(64),
      },
    ],
  });

  const plan = buildPortableResumePlan({
    manifest: candidate,
    reconciliation: {
      status: 'READY',
      readyToMutate: true,
      authority: 'NONE',
    },
    secrets: {
      status: 'BLOCKED_CONFIGURATION',
      blockedHandleIds: ['provider.openai.api'],
      secretDependentWorkReady: false,
      authority: 'NONE',
      secretValuesPresent: false,
    },
  });

  assert.equal(plan.status, 'READY');
  assert.deepEqual(plan.parkedDecisionIds, ['decision-017']);
  assert.deepEqual(plan.readyNodeIds, ['node-ready-a', 'node-ready-b']);
  assert.deepEqual(plan.waitingNodeIds, ['node-waiting']);
  assert.deepEqual(plan.completedNodeIds, ['node-complete']);
  assert.deepEqual(plan.secretBlockedHandleIds, ['provider.openai.api']);
  assert.equal(plan.secretDependentWorkReady, false);
  assert.equal(plan.canContinueIndependentWork, true);
  assert.equal(plan.localSqliteRequired, false);
  assert.equal(plan.localOnlyCacheRequired, false);
  assert.equal(plan.semanticGatePassInferred, false);
  assert.equal(plan.authority, 'NONE');
});

test('portable resume planner fails closed on reconciliation drift', () => {
  const candidate = manifest();

  const plan = buildPortableResumePlan({
    manifest: candidate,
    reconciliation: {
      status: 'RECONCILIATION_REQUIRED',
      readyToMutate: false,
      authority: 'NONE',
    },
    secrets: {
      status: 'NOT_CHECKED',
      secretDependentWorkReady: false,
      authority: 'NONE',
      secretValuesPresent: false,
    },
  });

  assert.equal(plan.status, 'RECONCILIATION_REQUIRED');
  assert.equal(plan.canContinueIndependentWork, false);
  assert.equal(plan.localSqliteRequired, false);
});

test('portable resume planner preserves parked and waiting state when no node is ready', () => {
  const candidate = manifest({
    parkedDecisionIds: ['decision-017'],
    readyNodeIds: [],
    waitingNodeIds: ['node-waiting'],
  });

  const plan = buildPortableResumePlan({
    manifest: candidate,
    reconciliation: {
      status: 'READY',
      readyToMutate: true,
      authority: 'NONE',
    },
    secrets: {
      status: 'READY',
      blockedHandleIds: [],
      secretDependentWorkReady: true,
      authority: 'NONE',
      secretValuesPresent: false,
    },
  });

  assert.equal(plan.status, 'BLOCKED');
  assert.deepEqual(plan.parkedDecisionIds, ['decision-017']);
  assert.deepEqual(plan.waitingNodeIds, ['node-waiting']);
  assert.deepEqual(plan.readyNodeIds, []);
  assert.equal(plan.canContinueIndependentWork, false);
});

test('portable resume planner rejects missing readiness evidence', () => {
  const candidate = manifest();

  assert.throws(
    () =>
      buildPortableResumePlan({
        manifest: candidate,
        reconciliation: null,
        secrets: {},
      }),
    /reconciliation result is required/,
  );
  assert.throws(
    () =>
      buildPortableResumePlan({
        manifest: candidate,
        reconciliation: { status: 'READY', readyToMutate: true },
        secrets: null,
      }),
    /secret readiness result is required/,
  );
});

test('portable resume project discovery selects the only remote project', async () => {
  const selected = await resolvePortableResumeProjectId(
    {
      async listProjectIds() {
        return ['project-151'];
      },
    },
    null,
  );
  assert.equal(selected, 'project-151');
});

test('portable resume project discovery requires explicit selection when remote has multiple projects', async () => {
  await assert.rejects(
    () =>
      resolvePortableResumeProjectId(
        {
          async listProjectIds() {
            return ['project-151', 'project-200'];
          },
        },
        null,
      ),
    /multiple portable resume projects found.*project-151, project-200/,
  );

  let discoveryCalls = 0;
  const explicit = await resolvePortableResumeProjectId(
    {
      async listProjectIds() {
        discoveryCalls += 1;
        return ['project-151', 'project-200'];
      },
    },
    'project-200',
  );
  assert.equal(explicit, 'project-200');
  assert.equal(discoveryCalls, 0);
});

test('portable resume project discovery fails closed when no remote state exists', async () => {
  await assert.rejects(
    () =>
      resolvePortableResumeProjectId(
        {
          async listProjectIds() {
            return [];
          },
        },
        null,
      ),
    /no portable resume project state found/,
  );
  await assert.rejects(
    () => resolvePortableResumeProjectId({}, null),
    /does not support project discovery/,
  );
  await assert.rejects(() => resolvePortableResumeProjectId({}, 'x'), /bounded identifier/);
});


test('portable resume currentness evidence verifies all five hash dimensions', () => {
  const bundle = portableEventBundle();
  const candidate = manifestWithPortableEvents(bundle);

  const result = evaluatePortableResumeCurrentnessEvidence({
    manifest: candidate,
    eventBundle: bundle,
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.verified, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.authority, 'NONE');
});

test('portable resume currentness evidence fails closed when missing duplicated or drifted', () => {
  const missing = createPortableCanonicalEventBundleV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    runId: 'run-151',
    exactRevision: REMOTE_HEAD,
    events: [
      {
        schemaVersion: 1,
        type: 'run.started',
        timestamp: '2026-09-25T07:00:00.000Z',
        runId: 'run-151',
        taskId: 'task-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          pullRequest: 151,
          branch: 'feature/resume',
          baseSha: 'b'.repeat(40),
          headSha: REMOTE_HEAD,
        },
        workflow: { id: 'project-execution', version: '1.0.0', hash: H1 },
        payload: { checkpoint: 'portable' },
      },
    ],
  });
  const missingManifest = manifestWithPortableEvents(missing);
  const missingResult = evaluatePortableResumeCurrentnessEvidence({
    manifest: missingManifest,
    eventBundle: missing,
  });
  assert.equal(missingResult.status, 'MISSING');
  assert.equal(missingResult.verified, false);

  const duplicate = createPortableCanonicalEventBundleV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    runId: 'run-151',
    exactRevision: REMOTE_HEAD,
    events: [
      {
        schemaVersion: 1,
        type: 'run.started',
        timestamp: '2026-09-25T07:00:00.000Z',
        runId: 'run-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          headSha: REMOTE_HEAD,
        },
        workflow: { id: 'project-execution', version: '1.0.0', hash: H1 },
        payload: { portableResumeCurrentness: portableResumeCurrentness() },
      },
      {
        schemaVersion: 1,
        type: 'run.progress',
        timestamp: '2026-09-25T07:00:01.000Z',
        runId: 'run-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          headSha: REMOTE_HEAD,
        },
        workflow: { id: 'project-execution', version: '1.0.0', hash: H1 },
        payload: { portableResumeCurrentness: portableResumeCurrentness() },
      },
    ],
  });
  const duplicateManifest = manifestWithPortableEvents(duplicate);
  const duplicateResult = evaluatePortableResumeCurrentnessEvidence({
    manifest: duplicateManifest,
    eventBundle: duplicate,
  });
  assert.equal(duplicateResult.status, 'INVALID');
  assert.equal(duplicateResult.verified, false);

  const drifted = createPortableCanonicalEventBundleV1({
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-151',
    runId: 'run-151',
    exactRevision: REMOTE_HEAD,
    events: [
      {
        schemaVersion: 1,
        type: 'run.started',
        timestamp: '2026-09-25T07:00:00.000Z',
        runId: 'run-151',
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          headSha: REMOTE_HEAD,
        },
        workflow: { id: 'project-execution', version: '1.0.0', hash: H1 },
        payload: {
          portableResumeCurrentness: portableResumeCurrentness({
            bindingSnapshotHash: H6,
          }),
        },
      },
    ],
  });
  const driftedManifest = manifestWithPortableEvents(drifted);
  const driftedResult = evaluatePortableResumeCurrentnessEvidence({
    manifest: driftedManifest,
    eventBundle: drifted,
  });
  assert.equal(driftedResult.status, 'MISMATCH');
  assert.equal(driftedResult.verified, false);
  assert.match(driftedResult.errors.join(' '), /bindingSnapshotHash mismatch/);
});

test('portable resume reconciliation reports event-bundle currentness mismatch', () => {
  const bundle = portableEventBundle();
  const candidate = manifestWithPortableEvents(bundle);
  const driftedBundle = createPortableCanonicalEventBundleV1({
    repositoryIdentity: bundle.repositoryIdentity,
    projectId: bundle.projectId,
    runId: bundle.runId,
    exactRevision: bundle.exactRevision,
    events: bundle.events.map((record, index) =>
      index === 0
        ? {
            ...record.event,
            payload: {
              ...record.event.payload,
              portableResumeCurrentness: portableResumeCurrentness({
                policyHash: H6,
              }),
            },
          }
        : record.event,
    ),
  });

  const result = evaluatePortableResumeReconciliation({
    manifest: candidate,
    repositoryIdentity: candidate.repositoryIdentity,
    remoteHead: REMOTE_HEAD,
    eventBundle: driftedBundle,
  });

  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.currentnessStatus, 'MISMATCH');
  assert.equal(result.currentnessVerified, false);
  assert.match(result.errors.join(' '), /policyHash mismatch/);
});
