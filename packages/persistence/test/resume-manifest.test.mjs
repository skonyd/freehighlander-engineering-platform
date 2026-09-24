import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createResumeManifestV1,
  evaluateResumeManifestCas,
  localResumeCacheRequiredForCorrectness,
  resumeArtifactCanBeReconstructed,
  resumeArtifactMustTransfer,
  resumeManifestCanContainSecretValues,
  resumeManifestCanGrantAuthority,
  validateResumeManifestV1,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);
const GIT1 = 'a'.repeat(40);
const GIT2 = 'b'.repeat(40);

function manifestInput(overrides = {}) {
  return {
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    projectId: 'project-001',
    activeWorkItemId: 'issue-151',
    issueNumber: 151,
    pullRequestNumber: null,
    branch: 'feature/resume',
    remoteHead: GIT1,
    baseRevision: GIT2,
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
      reviewer: 'PARKED',
      implementer: 'COMPLETE',
    },
    completedNodeResults: [
      { nodeId: 'node-b', resultHash: H2, executionKey: H3 },
      { nodeId: 'node-a', resultHash: H1, executionKey: H2 },
    ],
    parkedDecisionIds: ['decision-b', 'decision-a'],
    waitingNodeIds: ['node-wait-b', 'node-wait-a'],
    readyNodeIds: ['node-ready-b', 'node-ready-a'],
    artifactManifest: [
      {
        artifactId: 'artifact-b',
        contentHash: H2,
        classification: 'RECONSTRUCTIBLE',
      },
      {
        artifactId: 'artifact-a',
        contentHash: H1,
        classification: 'PORTABLE_REQUIRED',
      },
      {
        artifactId: 'artifact-c',
        contentHash: H3,
        classification: 'LOCAL_ONLY_CACHE',
      },
    ],
    checkpointHash: H4,
    replayManifestHash: H5,
    workspaceLogicalId: 'workspace-151',
    requiredProviderCapabilities: {
      'provider-b': ['tools', 'reasoning'],
      'provider-a': ['structured-output', 'reasoning'],
    },
    requiredSecretHandleIds: ['provider.openai.api', 'github.repo.auth'],
    createdAt: '2026-09-24T10:00:00.000Z',
    generation: 1,
    ...overrides,
  };
}

test('portable resume manifest is deterministic normalized and authority-neutral', () => {
  const first = createResumeManifestV1(manifestInput());
  const second = createResumeManifestV1(
    manifestInput({
      logicalRoleState: {
        implementer: 'COMPLETE',
        reviewer: 'PARKED',
      },
      completedNodeResults: [...manifestInput().completedNodeResults].reverse(),
      parkedDecisionIds: ['decision-a', 'decision-b'],
      waitingNodeIds: ['node-wait-a', 'node-wait-b'],
      readyNodeIds: ['node-ready-a', 'node-ready-b'],
      artifactManifest: [...manifestInput().artifactManifest].reverse(),
      requiredProviderCapabilities: {
        'provider-a': ['reasoning', 'structured-output'],
        'provider-b': ['reasoning', 'tools'],
      },
      requiredSecretHandleIds: ['github.repo.auth', 'provider.openai.api'],
    }),
  );

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.completedNodeResults.map((item) => item.nodeId),
    ['node-a', 'node-b'],
  );
  assert.deepEqual(first.parkedDecisionIds, ['decision-a', 'decision-b']);
  assert.deepEqual(first.waitingNodeIds, ['node-wait-a', 'node-wait-b']);
  assert.deepEqual(first.readyNodeIds, ['node-ready-a', 'node-ready-b']);
  assert.deepEqual(
    first.artifactManifest.map((item) => item.artifactId),
    ['artifact-a', 'artifact-b', 'artifact-c'],
  );
  assert.deepEqual(Object.keys(first.requiredProviderCapabilities), ['provider-a', 'provider-b']);
  assert.deepEqual(first.requiredProviderCapabilities['provider-a'], [
    'reasoning',
    'structured-output',
  ]);
  assert.deepEqual(first.requiredSecretHandleIds, [
    'github.repo.auth',
    'provider.openai.api',
  ]);
  assert.match(first.manifestHash, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');
  validateResumeManifestV1(first);
});

test('portable manifest ignores non-contract secret values and machine-local fields', () => {
  const manifest = createResumeManifestV1({
    ...manifestInput(),
    secretValue: 'must-not-persist',
    token: 'must-not-persist',
    hostname: 'source-machine',
    workspacePath: '/home/user/repo',
  });

  assert.equal(Object.hasOwn(manifest, 'secretValue'), false);
  assert.equal(Object.hasOwn(manifest, 'token'), false);
  assert.equal(Object.hasOwn(manifest, 'hostname'), false);
  assert.equal(Object.hasOwn(manifest, 'workspacePath'), false);
  assert.equal(JSON.stringify(manifest).includes('must-not-persist'), false);
  assert.equal(JSON.stringify(manifest).includes('/home/user/repo'), false);
});

test('manifest rejects absolute or path-shaped logical workspace identities', () => {
  for (const workspaceLogicalId of [
    '/home/user/workspace',
    'C:\\Users\\user\\workspace',
    'relative/path',
    'relative\\path',
    'x',
  ]) {
    assert.throws(() =>
      createResumeManifestV1(manifestInput({ workspaceLogicalId })),
    );
  }
});

test('manifest rejects malformed hashes revisions timestamps generations and optional numbers', () => {
  for (const input of [
    manifestInput({ repositoryIdentity: ' ' }),
    manifestInput({ projectId: 'x' }),
    manifestInput({ activeWorkItemId: 'x' }),
    manifestInput({ issueNumber: 0 }),
    manifestInput({ issueNumber: 1.5 }),
    manifestInput({ pullRequestNumber: 0 }),
    manifestInput({ branch: ' ' }),
    manifestInput({ remoteHead: 'abc123' }),
    manifestInput({ remoteHead: 'A'.repeat(40) }),
    manifestInput({ baseRevision: 'bad' }),
    manifestInput({ workflow: { ...manifestInput().workflow, id: 'x' } }),
    manifestInput({ workflow: { ...manifestInput().workflow, version: '' } }),
    manifestInput({ workflow: { ...manifestInput().workflow, hash: 'bad' } }),
    manifestInput({ runSnapshotHash: 'bad' }),
    manifestInput({ policyHash: 'bad' }),
    manifestInput({ catalogSnapshotHash: 'bad' }),
    manifestInput({ bindingSnapshotHash: 'bad' }),
    manifestInput({ checkpointHash: 'bad' }),
    manifestInput({ replayManifestHash: 'bad' }),
    manifestInput({ createdAt: 'not-a-date' }),
    manifestInput({ generation: 0 }),
    manifestInput({ generation: 1.5 }),
  ]) {
    assert.throws(() => createResumeManifestV1(input));
  }

  const noActiveItem = createResumeManifestV1(
    manifestInput({
      activeWorkItemId: null,
      issueNumber: null,
      pullRequestNumber: 160,
    }),
  );
  assert.equal(noActiveItem.activeWorkItemId, null);
  assert.equal(noActiveItem.issueNumber, null);
  assert.equal(noActiveItem.pullRequestNumber, 160);
});

test('manifest rejects ambiguous duplicate or conflicting portable identities', () => {
  for (const input of [
    manifestInput({
      completedNodeResults: [
        { nodeId: 'node-a', resultHash: H1, executionKey: H2 },
        { nodeId: 'node-a', resultHash: H2, executionKey: H3 },
      ],
    }),
    manifestInput({
      completedNodeResults: [{ nodeId: 'x', resultHash: H1, executionKey: H2 }],
    }),
    manifestInput({
      completedNodeResults: [{ nodeId: 'node-a', resultHash: 'bad', executionKey: H2 }],
    }),
    manifestInput({ parkedDecisionIds: ['decision-a', 'decision-a'] }),
    manifestInput({ waitingNodeIds: ['node-a', 'node-a'] }),
    manifestInput({ readyNodeIds: ['node-a', 'node-a'] }),
    manifestInput({ waitingNodeIds: ['node-shared'], readyNodeIds: ['node-shared'] }),
    manifestInput({
      artifactManifest: [
        { artifactId: 'artifact-a', contentHash: H1, classification: 'PORTABLE_REQUIRED' },
        { artifactId: 'artifact-a', contentHash: H2, classification: 'RECONSTRUCTIBLE' },
      ],
    }),
    manifestInput({
      artifactManifest: [
        { artifactId: 'artifact-a', contentHash: 'bad', classification: 'PORTABLE_REQUIRED' },
      ],
    }),
    manifestInput({
      artifactManifest: [
        { artifactId: 'artifact-a', contentHash: H1, classification: 'UNKNOWN' },
      ],
    }),
    manifestInput({
      requiredProviderCapabilities: {
        x: ['reasoning'],
      },
    }),
    manifestInput({
      requiredProviderCapabilities: {
        'provider-a': ['x'],
      },
    }),
    manifestInput({
      requiredProviderCapabilities: {
        'provider-a': ['reasoning', 'reasoning'],
      },
    }),
    manifestInput({ requiredSecretHandleIds: ['github.repo.auth', 'github.repo.auth'] }),
    manifestInput({ requiredSecretHandleIds: ['x'] }),
    manifestInput({ logicalRoleState: { x: 'READY' } }),
    manifestInput({ logicalRoleState: { reviewer: ' ' } }),
  ]) {
    assert.throws(() => createResumeManifestV1(input));
  }
});

test('manifest hash validation rejects tampering and authority expansion', () => {
  const manifest = createResumeManifestV1(manifestInput());

  assert.throws(
    () => validateResumeManifestV1({ ...manifest, remoteHead: 'c'.repeat(40) }),
    /hash mismatch/,
  );
  assert.throws(
    () => validateResumeManifestV1({ ...manifest, manifestHash: H1 }),
    /hash mismatch/,
  );
  assert.throws(
    () => validateResumeManifestV1({ ...manifest, schemaVersion: 2 }),
    /schemaVersion/,
  );
  assert.throws(
    () => validateResumeManifestV1({ ...manifest, authority: 'SYSTEM_POLICY' }),
    /authority/,
  );
});

test('resume manifest CAS accepts exact next generation and rejects stale writers', () => {
  const first = createResumeManifestV1(manifestInput({ generation: 1 }));

  assert.deepEqual(evaluateResumeManifestCas(null, first, null), {
    status: 'ACCEPT',
    reasons: [],
    acceptedGeneration: 1,
    authority: 'NONE',
  });

  const second = createResumeManifestV1(
    manifestInput({
      generation: 2,
      remoteHead: 'c'.repeat(40),
      createdAt: '2026-09-24T10:05:00.000Z',
    }),
  );
  assert.deepEqual(evaluateResumeManifestCas(first, second, 1), {
    status: 'ACCEPT',
    reasons: [],
    acceptedGeneration: 2,
    authority: 'NONE',
  });

  const stale = evaluateResumeManifestCas(first, second, 0);
  assert.equal(stale.status, 'CONFLICT');
  assert.deepEqual(stale.reasons, ['stale manifest generation']);
  assert.equal(stale.acceptedGeneration, null);

  const skippedGeneration = createResumeManifestV1(
    manifestInput({
      generation: 3,
      createdAt: '2026-09-24T10:06:00.000Z',
    }),
  );
  assert.equal(evaluateResumeManifestCas(first, skippedGeneration, 1).status, 'CONFLICT');
});

test('resume manifest CAS rejects invalid initial generation and repository or project drift', () => {
  const initialGenerationTwo = createResumeManifestV1(manifestInput({ generation: 2 }));
  const noCurrent = evaluateResumeManifestCas(null, initialGenerationTwo, 1);
  assert.equal(noCurrent.status, 'CONFLICT');
  assert.deepEqual(noCurrent.reasons, [
    'expected generation requires an existing manifest',
    'initial manifest generation must be 1',
  ]);

  const current = createResumeManifestV1(manifestInput({ generation: 1 }));
  const otherRepository = createResumeManifestV1(
    manifestInput({
      repositoryIdentity: 'skonyd/other-repository',
      generation: 2,
    }),
  );
  const otherProject = createResumeManifestV1(
    manifestInput({
      projectId: 'project-002',
      generation: 2,
    }),
  );

  assert.deepEqual(evaluateResumeManifestCas(current, otherRepository, 1).reasons, [
    'repository identity mismatch',
  ]);
  assert.deepEqual(evaluateResumeManifestCas(current, otherProject, 1).reasons, [
    'project identity mismatch',
  ]);
});

test('artifact portability classes have explicit correctness semantics', () => {
  assert.equal(resumeArtifactMustTransfer('PORTABLE_REQUIRED'), true);
  assert.equal(resumeArtifactMustTransfer('RECONSTRUCTIBLE'), false);
  assert.equal(resumeArtifactMustTransfer('LOCAL_ONLY_CACHE'), false);

  assert.equal(resumeArtifactCanBeReconstructed('PORTABLE_REQUIRED'), false);
  assert.equal(resumeArtifactCanBeReconstructed('RECONSTRUCTIBLE'), true);
  assert.equal(resumeArtifactCanBeReconstructed('LOCAL_ONLY_CACHE'), false);

  assert.throws(() => resumeArtifactMustTransfer('UNKNOWN'));
  assert.throws(() => resumeArtifactCanBeReconstructed('UNKNOWN'));

  assert.equal(localResumeCacheRequiredForCorrectness(), false);
  assert.equal(resumeManifestCanContainSecretValues(), false);
  assert.equal(resumeManifestCanGrantAuthority(), false);
});
