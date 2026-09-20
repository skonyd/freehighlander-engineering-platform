import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecoveryCheckpoint,
  buildReplayManifest,
  nextReplaySequence,
  replayOrSimulationCanGrantAuthority,
  replayStep,
  validateRecoveryCheckpoint,
  validateReplayContext,
} from '../dist/index.js';

const hash = (char) => char.repeat(64);

const manifestInput = {
  runId: 'run-1',
  exactRevision: 'rev-1',
  workflowHash: hash('a'),
  runSnapshotHash: hash('b'),
  policyHash: hash('c'),
  artifactRootHashes: [hash('d')],
  outcomes: [
    {
      sequence: 0,
      nodeId: 'collect',
      state: 'PASSED',
      inputHash: hash('e'),
      outputHash: hash('f'),
      artifactHashes: [hash('1')],
    },
    {
      sequence: 1,
      nodeId: 'review',
      state: 'PASSED',
      inputHash: hash('2'),
      outputHash: hash('3'),
      artifactHashes: [hash('4')],
    },
  ],
};

test('replay manifest is deterministic and sequence-normalized', () => {
  const first = buildReplayManifest(manifestInput);
  const second = buildReplayManifest({
    ...manifestInput,
    outcomes: [...manifestInput.outcomes].reverse(),
  });

  assert.equal(first.manifestHash, second.manifestHash);
  assert.deepEqual(
    first.outcomes.map((outcome) => outcome.nodeId),
    ['collect', 'review'],
  );
});

test('replay validation binds revision, workflow, snapshot, policy and artifact roots', () => {
  const manifest = buildReplayManifest(manifestInput);
  const valid = validateReplayContext(manifest, {
    exactRevision: 'rev-1',
    workflowHash: hash('a'),
    runSnapshotHash: hash('b'),
    policyHash: hash('c'),
    artifactRootHashes: [hash('d')],
  });
  assert.equal(valid.valid, true);

  const mismatch = validateReplayContext(manifest, {
    exactRevision: 'rev-2',
    workflowHash: hash('a'),
    runSnapshotHash: hash('b'),
    policyHash: hash('c'),
    artifactRootHashes: [hash('d')],
  });
  assert.equal(mismatch.valid, false);
  assert.match(mismatch.errors[0], /revision mismatch/);
});

test('replay step reports divergence instead of hiding it', () => {
  const manifest = buildReplayManifest(manifestInput);
  const same = replayStep(manifest, 0, hash('e'));
  const changed = replayStep(manifest, 0, hash('9'));

  assert.equal(same.divergent, false);
  assert.equal(changed.divergent, true);
  assert.equal(changed.nodeId, 'collect');
});

test('durable checkpoint validates exact replay identity and resumes at next sequence', () => {
  const manifest = buildReplayManifest(manifestInput);
  const checkpoint = buildRecoveryCheckpoint({
    runId: 'run-1',
    exactRevision: 'rev-1',
    workflowHash: hash('a'),
    runSnapshotHash: hash('b'),
    replayManifestHash: manifest.manifestHash,
    completedSequence: 0,
    nodeStates: {
      collect: 'PASSED',
      review: 'READY',
    },
    artifactHashes: [hash('1')],
  });

  assert.equal(validateRecoveryCheckpoint(checkpoint, manifest).valid, true);
  assert.equal(nextReplaySequence(checkpoint, manifest), 1);

  const tampered = {
    ...checkpoint,
    completedSequence: 1,
  };
  const validation = validateRecoveryCheckpoint(tampered, manifest);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /checkpoint hash mismatch/);
});

test('stale checkpoint fails closed on replay manifest mismatch', () => {
  const manifest = buildReplayManifest(manifestInput);
  const checkpoint = buildRecoveryCheckpoint({
    runId: 'run-1',
    exactRevision: 'rev-1',
    workflowHash: hash('a'),
    runSnapshotHash: hash('b'),
    replayManifestHash: hash('7'),
    completedSequence: -1,
    nodeStates: {},
    artifactHashes: [],
  });

  const validation = validateRecoveryCheckpoint(checkpoint, manifest);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /replay manifest mismatch/);
  assert.throws(() => nextReplaySequence(checkpoint, manifest), /invalid recovery checkpoint/);
});

test('invalid replay sequences fail closed and simulation never grants authority', () => {
  assert.throws(
    () =>
      buildReplayManifest({
        ...manifestInput,
        outcomes: [
          {
            ...manifestInput.outcomes[0],
            sequence: 1,
          },
        ],
      }),
    /contiguous from zero/,
  );

  assert.equal(replayOrSimulationCanGrantAuthority('REPLAY'), false);
  assert.equal(replayOrSimulationCanGrantAuthority('SIMULATION'), false);
});
