import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDevelopmentSnapshot,
  developmentCanExecuteCommands,
  developmentCanGrantAuthority,
  developmentCanMergePullRequests,
  developmentCanMutateGit,
  developmentProjection,
  validateChangeCandidate,
  validateDevelopmentTask,
  validateTaskCandidateBinding,
} from '../dist/index.js';

const repository = 'skonyd/freehighlander-engineering-platform';
const baseRevision = 'f8cfb7f472180f900a007bc08256b5b4dc3d0492';
const headRevision = '1111111111111111111111111111111111111111';

const task = {
  schemaVersion: 1,
  id: 'fh-31a',
  revision: 1,
  title: 'Development module',
  repository,
  baseRevision,
  status: 'CANDIDATE',
  intent: 'Represent an authority-neutral implementation candidate.',
  acceptanceCriteria: ['AC-DEV-1', 'AC-DEV-2'],
  scopePaths: [{ path: 'packages/development/src/index.ts' }],
  blockers: [],
};

const candidate = {
  schemaVersion: 1,
  id: 'fh-31a-candidate-1',
  taskId: 'fh-31a',
  repository,
  baseRevision,
  headRevision,
  intent: 'Add deterministic development contracts.',
  affectedPaths: [{ path: 'packages/development/src/index.ts', change: 'ADD' }],
  resultEvidence: [
    {
      id: 'E-1',
      kind: 'DIFF',
      repository,
      revision: headRevision,
      provenance: 'TRUSTED',
      digest: 'a'.repeat(64),
    },
  ],
  shadowPlan: [
    {
      id: 'S-1',
      kind: 'EDIT',
      description: 'Describe the intended source change without executing it.',
      affectedPaths: ['packages/development/src/index.ts'],
      sideEffects: 'FORBIDDEN',
      authority: 'NONE',
    },
  ],
};

test('valid task and candidate bind exact repository revisions', () => {
  assert.equal(validateDevelopmentTask(task).valid, true);
  assert.equal(validateChangeCandidate(candidate).valid, true);
  assert.equal(validateTaskCandidateBinding(task, candidate).valid, true);
});

test('development snapshot is deterministic and non-authoritative', async () => {
  const first = await buildDevelopmentSnapshot(candidate);
  const second = await buildDevelopmentSnapshot(structuredClone(candidate));

  assert.equal(first.candidateHash, second.candidateHash);
  assert.equal(first.reviewReadiness, 'READY_FOR_REVIEW');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.executionAuthorized, false);
  assert.equal(first.gitMutationAuthorized, false);
  assert.equal(first.mergeAuthorized, false);
  assert.equal(developmentCanGrantAuthority(), false);
  assert.equal(developmentCanExecuteCommands(), false);
  assert.equal(developmentCanMutateGit(), false);
  assert.equal(developmentCanMergePullRequests(), false);
});

test('revision mismatch and same base/head fail closed', () => {
  const sameHead = validateChangeCandidate({
    ...candidate,
    headRevision: baseRevision,
    resultEvidence: [],
  });
  const mismatchedEvidence = validateChangeCandidate({
    ...candidate,
    resultEvidence: [{ ...candidate.resultEvidence[0], revision: '2'.repeat(40) }],
  });

  assert.equal(sameHead.valid, false);
  assert.match(sameHead.errors.join('\n'), /headRevision must differ/);
  assert.equal(mismatchedEvidence.valid, false);
  assert.match(mismatchedEvidence.errors.join('\n'), /must match candidate headRevision/);
});

test('path traversal and out-of-scope changes fail closed', () => {
  const traversal = validateChangeCandidate({
    ...candidate,
    affectedPaths: [{ path: '../secret.txt', change: 'MODIFY' }],
    shadowPlan: [],
  });
  const outsideScope = validateTaskCandidateBinding(task, {
    ...candidate,
    affectedPaths: [{ path: 'packages/other/src/index.ts', change: 'ADD' }],
    shadowPlan: [],
  });

  assert.equal(traversal.valid, false);
  assert.match(traversal.errors.join('\n'), /traversal segments/);
  assert.equal(outsideScope.valid, false);
  assert.match(outsideScope.errors.join('\n'), /outside task scope/);
});

test('shadow plan cannot request side effects or authority', () => {
  const result = validateChangeCandidate({
    ...candidate,
    shadowPlan: [
      {
        ...candidate.shadowPlan[0],
        sideEffects: 'ALLOWED',
        authority: 'WRITER',
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /sideEffects must be FORBIDDEN/);
  assert.match(result.errors.join('\n'), /authority must be NONE/);
});

test('read-only projection without evidence is not review-ready', () => {
  const projection = developmentProjection({
    ...candidate,
    resultEvidence: [],
  });

  assert.equal(projection.reviewReadiness, 'NOT_READY');
  assert.equal(projection.executionAuthorized, false);
  assert.equal(projection.gitMutationAuthorized, false);
  assert.equal(projection.mergeAuthorized, false);
});
