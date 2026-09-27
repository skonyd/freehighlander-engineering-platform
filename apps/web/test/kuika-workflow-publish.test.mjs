import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaWorkflowPublishCandidateV1,
  workflowPublishCandidateCanExecute,
  workflowPublishCandidateCanGrantAuthority,
  workflowPublishCandidateCanPublish,
} from '../dist/index.js';

const previous = {
  id: 'workflow-demo',
  version: '1.0.0',
  nodes: [
    { id: 'plan', kind: 'MODEL', role: 'planner' },
    { id: 'review', kind: 'HUMAN', approvalPolicy: 'HUMAN_REQUIRED' },
  ],
  edges: [{ from: 'plan', to: 'review' }],
};

const next = {
  id: 'workflow-demo',
  version: '1.1.0',
  nodes: [
    { id: 'plan', kind: 'MODEL', role: 'planner' },
    { id: 'review', kind: 'HUMAN', approvalPolicy: 'HUMAN_REQUIRED' },
    { id: 'gate', kind: 'GATE' },
  ],
  edges: [
    { from: 'plan', to: 'review' },
    { from: 'review', to: 'gate' },
  ],
};

test('workflow publish candidate is immutable, deterministic and non-authoritative', () => {
  const first = createFhKuikaWorkflowPublishCandidateV1(previous, next);
  const second = createFhKuikaWorkflowPublishCandidateV1(previous, next);

  assert.deepEqual(first, second);
  assert.equal(first.state, 'READY_FOR_CANONICAL_REVIEW');
  assert.equal(first.previousVersion, '1.0.0');
  assert.equal(first.candidateVersion, '1.1.0');
  assert.match(first.definitionHash, /^[a-f0-9]{64}$/);
  assert.equal(first.diff.authoritySensitiveChange, true);
  assert.equal(first.immutableCandidate, true);
  assert.equal(first.authority, 'NONE');
  assert.equal(first.publishAuthorized, false);
  assert.equal(first.executionAuthorized, false);
  assert.equal(workflowPublishCandidateCanPublish(), false);
  assert.equal(workflowPublishCandidateCanExecute(), false);
  assert.equal(workflowPublishCandidateCanGrantAuthority(), false);
});

test('workflow publish candidate fails closed on non-incrementing version', () => {
  const candidate = createFhKuikaWorkflowPublishCandidateV1(previous, {
    ...next,
    version: '1.0.0',
  });

  assert.equal(candidate.state, 'BLOCKED');
  assert.equal(candidate.validation.valid, false);
  assert.match(candidate.validation.errors.join('\n'), /version must be greater/);
  assert.equal(candidate.publishAuthorized, false);
});

test('workflow publish candidate fails closed when workflow identity changes', () => {
  const candidate = createFhKuikaWorkflowPublishCandidateV1(previous, {
    ...next,
    id: 'other-workflow',
  });

  assert.equal(candidate.state, 'BLOCKED');
  assert.match(candidate.validation.errors.join('\n'), /workflow ids must match/);
});

test('workflow publish candidate keeps invalid semantic version blocked without authority', () => {
  const candidate = createFhKuikaWorkflowPublishCandidateV1(previous, {
    ...next,
    version: 'next',
  });

  assert.equal(candidate.state, 'BLOCKED');
  assert.match(candidate.validation.errors.join('\n'), /semantic version/);
  assert.equal(candidate.authority, 'NONE');
});
