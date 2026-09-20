import assert from 'node:assert/strict';
import test from 'node:test';

import {
  artifactLineageCanGrantAuthority,
  createArtifactEnvelope,
  isLineageArtifactCurrent,
  verifyArtifactEnvelope,
  verifyArtifactLineage,
} from '../dist/index.js';

const binding = {
  exactRevision: 'abc',
  workflowHash: 'workflow',
  roleContractHash: 'role',
  policyHash: 'policy',
  producerRole: 'repo-analyst',
  bindingId: 'qwen-local',
};

test('artifact envelope hash is deterministic and content-bound', async () => {
  const first = await createArtifactEnvelope({
    artifactId: 'a1',
    artifactKind: 'review',
    content: 'same output',
    binding,
  });
  const second = await createArtifactEnvelope({
    artifactId: 'different-display-id',
    artifactKind: 'review',
    content: 'same output',
    binding,
  });
  const changed = await createArtifactEnvelope({
    artifactId: 'a1',
    artifactKind: 'review',
    content: 'changed output',
    binding,
  });

  assert.equal(first.artifactHash, second.artifactHash);
  assert.notEqual(first.artifactHash, changed.artifactHash);
  assert.equal(first.contentHash.length, 64);
  assert.equal(await verifyArtifactEnvelope(first, 'same output'), true);
  assert.equal(await verifyArtifactEnvelope(first, 'tampered'), false);
});

test('binding and parent changes invalidate artifact identity', async () => {
  const parent = await createArtifactEnvelope({
    artifactId: 'parent',
    artifactKind: 'evidence',
    content: 'parent',
    binding,
  });
  const base = await createArtifactEnvelope({
    artifactId: 'child',
    artifactKind: 'review',
    content: 'child',
    binding,
    parentArtifactHashes: [parent.artifactHash],
  });
  const changedBinding = await createArtifactEnvelope({
    artifactId: 'child',
    artifactKind: 'review',
    content: 'child',
    binding: { ...binding, policyHash: 'policy-v2' },
    parentArtifactHashes: [parent.artifactHash],
  });
  const noParent = await createArtifactEnvelope({
    artifactId: 'child',
    artifactKind: 'review',
    content: 'child',
    binding,
  });

  assert.notEqual(base.artifactHash, changedBinding.artifactHash);
  assert.notEqual(base.artifactHash, noParent.artifactHash);
});

test('currentness is exact revision/workflow/role/policy bound', async () => {
  const artifact = await createArtifactEnvelope({
    artifactId: 'a1',
    artifactKind: 'review',
    content: 'output',
    binding,
  });

  assert.equal(
    isLineageArtifactCurrent(artifact, {
      exactRevision: 'abc',
      workflowHash: 'workflow',
      roleContractHash: 'role',
      policyHash: 'policy',
    }),
    true,
  );
  assert.equal(
    isLineageArtifactCurrent(artifact, {
      exactRevision: 'def',
      workflowHash: 'workflow',
      roleContractHash: 'role',
      policyHash: 'policy',
    }),
    false,
  );
});

test('lineage traversal is deterministic and fails closed on missing parents', async () => {
  const rootParent = await createArtifactEnvelope({
    artifactId: 'root-parent',
    artifactKind: 'evidence',
    content: 'root',
    binding,
  });
  const child = await createArtifactEnvelope({
    artifactId: 'child',
    artifactKind: 'review',
    content: 'child',
    binding,
    parentArtifactHashes: [rootParent.artifactHash],
  });

  const artifacts = new Map([
    [rootParent.artifactHash, rootParent],
    [child.artifactHash, child],
  ]);
  const valid = verifyArtifactLineage(child.artifactHash, artifacts);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.ancestry, [rootParent.artifactHash, child.artifactHash]);

  const missing = verifyArtifactLineage(child.artifactHash, new Map([[child.artifactHash, child]]));
  assert.equal(missing.valid, false);
  assert.match(missing.errors[0], /missing lineage artifact/);
});

test('duplicate parent hashes are rejected and lineage cannot grant authority', async () => {
  const parent = await createArtifactEnvelope({
    artifactId: 'parent',
    artifactKind: 'evidence',
    content: 'parent',
    binding,
  });

  await assert.rejects(
    () =>
      createArtifactEnvelope({
        artifactId: 'child',
        artifactKind: 'review',
        content: 'child',
        binding,
        parentArtifactHashes: [parent.artifactHash, parent.artifactHash],
      }),
    /duplicate parent artifact hash/,
  );
  assert.equal(artifactLineageCanGrantAuthority(), false);
});

test('lineage cycles fail closed', () => {
  const aHash = 'a'.repeat(64);
  const bHash = 'b'.repeat(64);
  const fakeBase = {
    schemaVersion: 1,
    artifactId: 'fake',
    artifactKind: 'test',
    contentHash: 'c'.repeat(64),
    binding,
  };
  const artifacts = new Map([
    [
      aHash,
      {
        ...fakeBase,
        artifactId: 'a',
        artifactHash: aHash,
        parentArtifactHashes: [bHash],
      },
    ],
    [
      bHash,
      {
        ...fakeBase,
        artifactId: 'b',
        artifactHash: bHash,
        parentArtifactHashes: [aHash],
      },
    ],
  ]);

  const result = verifyArtifactLineage(aHash, artifacts);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /lineage cycle detected/);
});
