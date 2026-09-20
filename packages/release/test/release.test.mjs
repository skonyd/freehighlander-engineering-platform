import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReleaseSnapshot,
  evaluateReleaseReadiness,
  releaseCanExecuteRollback,
  releaseCanGrantAuthority,
  releaseCanPublishTagOrRelease,
  releaseReadyCanAuthorizeDeployment,
  validateReleaseCandidate,
} from '../dist/index.js';

const repository = 'skonyd/freehighlander-engineering-platform';
const sourceRevision = '702df5a77b989b28cec87d81da5a5e53b801e2a2';
const buildRevision = 'b'.repeat(40);

const manifest = {
  schemaVersion: 1,
  id: 'manifest-1',
  repository,
  sourceRevision,
  buildRevision,
  artifacts: [
    {
      id: 'artifact-1',
      path: 'dist/freehighlander.tgz',
      digest: 'a'.repeat(64),
      mediaType: 'application/gzip',
    },
  ],
};

const evidence = (kind, id = kind.toLowerCase()) => ({
  id,
  kind,
  repository,
  revision: sourceRevision,
  digest: 'c'.repeat(64),
  provenance: 'TRUSTED',
  state: 'PASS',
});

const candidate = {
  schemaVersion: 1,
  id: 'release-candidate-1',
  repository,
  sourceRevision,
  buildRevision,
  artifactManifestId: manifest.id,
  evidence: [
    evidence('DEVELOPMENT'),
    evidence('TESTING'),
    evidence('SECURITY'),
    evidence('BUILD'),
    evidence('PROVENANCE'),
  ],
  rollbackPlan: {
    id: 'rollback-1',
    version: 1,
    targetRevision: '1'.repeat(40),
    steps: ['restore previous artifact', 'verify service health'],
    verified: true,
  },
};

test('complete trusted evidence produces readiness without authority', async () => {
  const readiness = evaluateReleaseReadiness(manifest, candidate);
  const first = await buildReleaseSnapshot(manifest, candidate);
  const second = await buildReleaseSnapshot(structuredClone(manifest), structuredClone(candidate));

  assert.equal(readiness.status, 'READY');
  assert.equal(readiness.authority, 'NONE');
  assert.equal(readiness.mergeAuthorized, false);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.deployAuthorized, false);
  assert.equal(readiness.rollbackAuthorized, false);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(releaseCanGrantAuthority(), false);
  assert.equal(releaseReadyCanAuthorizeDeployment(), false);
  assert.equal(releaseCanPublishTagOrRelease(), false);
  assert.equal(releaseCanExecuteRollback(), false);
});

test('missing trusted evidence fails closed as insufficient evidence', () => {
  const incomplete = {
    ...candidate,
    evidence: candidate.evidence.filter((entry) => entry.kind !== 'SECURITY'),
  };

  assert.equal(evaluateReleaseReadiness(manifest, incomplete).status, 'INSUFFICIENT_EVIDENCE');
});

test('explicit failed evidence blocks release readiness', () => {
  const blocked = {
    ...candidate,
    evidence: candidate.evidence.map((entry) =>
      entry.kind === 'TESTING' ? { ...entry, state: 'FAIL' } : entry,
    ),
  };

  assert.equal(evaluateReleaseReadiness(manifest, blocked).status, 'BLOCKED');
});

test('unverified rollback plan fails closed', () => {
  const unverified = {
    ...candidate,
    rollbackPlan: { ...candidate.rollbackPlan, verified: false },
  };

  assert.equal(evaluateReleaseReadiness(manifest, unverified).status, 'INSUFFICIENT_EVIDENCE');
});

test('revision mismatch is rejected', () => {
  const invalid = {
    ...candidate,
    sourceRevision: 'd'.repeat(40),
  };
  const result = validateReleaseCandidate(manifest, invalid);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /sourceRevision must match manifest sourceRevision/);
});

test('untrusted PASS does not satisfy required release evidence', () => {
  const untrusted = {
    ...candidate,
    evidence: candidate.evidence.map((entry) =>
      entry.kind === 'SECURITY' ? { ...entry, provenance: 'UNTRUSTED' } : entry,
    ),
  };

  assert.equal(evaluateReleaseReadiness(manifest, untrusted).status, 'INSUFFICIENT_EVIDENCE');
});
