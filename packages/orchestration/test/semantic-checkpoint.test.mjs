import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFreshContextReset,
  createSemanticCheckpoint,
  freshContextResetCarriesPreviousTrajectory,
  semanticCheckpointCanGrantAuthority,
  semanticCheckpointCanReplaceRequiredRawEvidence,
  validateSemanticCheckpoint,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function checkpoint(overrides = {}) {
  return createSemanticCheckpoint({
    boundary: 'IMPLEMENTATION_TO_REVIEW',
    logicalRole: 'test-reviewer',
    exactRevision: 'abc123',
    runSnapshotHash: hash('1'),
    policyHash: hash('2'),
    bindingPlanHash: hash('3'),
    authoritativeStateHashes: [hash('4'), hash('5')],
    artifactReferences: ['artifact:test-pass', 'artifact:diff'],
    ...overrides,
  });
}

test('semantic checkpoint is deterministic and input-order independent', () => {
  const first = checkpoint();
  const second = checkpoint({
    authoritativeStateHashes: [hash('5'), hash('4')],
    artifactReferences: ['artifact:diff', 'artifact:test-pass'],
  });

  assert.equal(first.checkpointHash, second.checkpointHash);
  assert.deepEqual(first.authoritativeStateHashes, [hash('4'), hash('5')]);
  assert.deepEqual(first.artifactReferences, ['artifact:diff', 'artifact:test-pass']);
  assert.equal(first.authority, 'NONE');
  assert.doesNotThrow(() => validateSemanticCheckpoint(first));
});

test('fresh reset carries only selected durable state and no previous trajectory', () => {
  const source = checkpoint();
  const reset = buildFreshContextReset({
    checkpoint: source,
    stablePrefixHash: hash('6'),
    taskHash: hash('7'),
    requiredAuthoritativeStateHashes: [hash('5')],
    selectedArtifactReferences: ['artifact:test-pass'],
  });

  assert.deepEqual(reset.authoritativeStateHashes, [hash('5')]);
  assert.deepEqual(reset.artifactReferences, ['artifact:test-pass']);
  assert.equal(reset.previousTrajectoryIncluded, false);
  assert.equal(reset.authority, 'NONE');
  assert.equal(freshContextResetCarriesPreviousTrajectory(), false);
});

test('required authoritative state cannot disappear during context reset', () => {
  const source = checkpoint();

  assert.throws(
    () =>
      buildFreshContextReset({
        checkpoint: source,
        stablePrefixHash: hash('6'),
        taskHash: hash('7'),
        requiredAuthoritativeStateHashes: [hash('8')],
        selectedArtifactReferences: [],
      }),
    /missing required authoritative state/,
  );
});

test('reset cannot reference artifacts outside the durable checkpoint', () => {
  const source = checkpoint();

  assert.throws(
    () =>
      buildFreshContextReset({
        checkpoint: source,
        stablePrefixHash: hash('6'),
        taskHash: hash('7'),
        requiredAuthoritativeStateHashes: [hash('4')],
        selectedArtifactReferences: ['artifact:unknown'],
      }),
    /unknown checkpoint artifact/,
  );
});

test('checkpoint identity changes with revision policy binding or authoritative state', () => {
  const base = checkpoint();
  assert.notEqual(base.checkpointHash, checkpoint({ exactRevision: 'def456' }).checkpointHash);
  assert.notEqual(base.checkpointHash, checkpoint({ policyHash: hash('8') }).checkpointHash);
  assert.notEqual(base.checkpointHash, checkpoint({ bindingPlanHash: hash('9') }).checkpointHash);
  assert.notEqual(
    base.checkpointHash,
    checkpoint({ authoritativeStateHashes: [hash('4'), hash('a')] }).checkpointHash,
  );
});

test('reset identity changes with task stable prefix or selected durable state', () => {
  const source = checkpoint();
  const base = buildFreshContextReset({
    checkpoint: source,
    stablePrefixHash: hash('6'),
    taskHash: hash('7'),
    requiredAuthoritativeStateHashes: [hash('4')],
    selectedArtifactReferences: ['artifact:diff'],
  });

  const taskChanged = buildFreshContextReset({
    checkpoint: source,
    stablePrefixHash: hash('6'),
    taskHash: hash('8'),
    requiredAuthoritativeStateHashes: [hash('4')],
    selectedArtifactReferences: ['artifact:diff'],
  });
  const stateChanged = buildFreshContextReset({
    checkpoint: source,
    stablePrefixHash: hash('6'),
    taskHash: hash('7'),
    requiredAuthoritativeStateHashes: [hash('5')],
    selectedArtifactReferences: ['artifact:diff'],
  });

  assert.notEqual(base.resetHash, taskChanged.resetHash);
  assert.notEqual(base.resetHash, stateChanged.resetHash);
});

test('checkpoint and reset remain authority-neutral and cannot replace required raw evidence', () => {
  assert.equal(semanticCheckpointCanGrantAuthority(), false);
  assert.equal(semanticCheckpointCanReplaceRequiredRawEvidence(), false);
});

test('checkpoint validation fails closed on malformed or tampered state', () => {
  assert.throws(
    () => checkpoint({ boundary: 'UNKNOWN' }),
    /boundary is invalid/,
  );
  assert.throws(
    () => checkpoint({ logicalRole: ' ' }),
    /logicalRole is required/,
  );
  assert.throws(
    () => checkpoint({ runSnapshotHash: 'bad' }),
    /runSnapshotHash must be lowercase sha256/,
  );
  assert.throws(
    () => checkpoint({ authoritativeStateHashes: [] }),
    /requires authoritative state/,
  );

  const valid = checkpoint();
  assert.throws(
    () => validateSemanticCheckpoint({ ...valid, checkpointHash: hash('0') }),
    /hash mismatch/,
  );
  assert.throws(
    () => validateSemanticCheckpoint({ ...valid, authority: 'SYSTEM_POLICY' }),
    /authority must be NONE/,
  );
});

test('fresh reset validates hashes and checkpoint integrity before reconstruction', () => {
  const source = checkpoint();

  assert.throws(
    () =>
      buildFreshContextReset({
        checkpoint: source,
        stablePrefixHash: 'bad',
        taskHash: hash('7'),
        requiredAuthoritativeStateHashes: [hash('4')],
        selectedArtifactReferences: [],
      }),
    /stablePrefixHash must be lowercase sha256/,
  );

  assert.throws(
    () =>
      buildFreshContextReset({
        checkpoint: { ...source, checkpointHash: hash('0') },
        stablePrefixHash: hash('6'),
        taskHash: hash('7'),
        requiredAuthoritativeStateHashes: [hash('4')],
        selectedArtifactReferences: [],
      }),
    /checkpoint hash mismatch/,
  );
});
