import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareFhKuikaWorkflowPublishCandidateV1,
  workflowPublishCandidateCanExecute,
  workflowPublishCandidateCanGrantAuthority,
  workflowPublishCandidateCanPublish,
} from '../dist/index.js';

const previous = {
  id: 'feature-flow',
  version: '1.0.0',
  nodes: [
    { id: 'plan', kind: 'MODEL', role: 'planner' },
    { id: 'review', kind: 'GATE' },
  ],
  edges: [{ from: 'plan', to: 'review' }],
};

const next = {
  id: 'feature-flow',
  version: '1.1.0',
  nodes: [
    { id: 'plan', kind: 'MODEL', role: 'planner' },
    { id: 'review', kind: 'GATE' },
    { id: 'human', kind: 'HUMAN' },
  ],
  edges: [
    { from: 'plan', to: 'review' },
    { from: 'review', to: 'human' },
  ],
};

test('workflow publish candidate is deterministic immutable preparation only', () => {
  const first = prepareFhKuikaWorkflowPublishCandidateV1({ previous, next });
  const second = prepareFhKuikaWorkflowPublishCandidateV1({ previous, next });

  assert.deepEqual(first, second);
  assert.equal(first.status, 'PUBLISH_CANDIDATE');
  assert.equal(first.canonicalHash.length, 64);
  assert.equal(first.immutableAfterPublish, true);
  assert.equal(first.corePublishAuthorityRequired, true);
  assert.equal(first.publishAuthorized, false);
  assert.equal(first.executionAuthorized, false);
  assert.equal(first.authority, 'NONE');
  assert.equal(first.diff.authoritySensitiveChange, true);
  assert.equal(workflowPublishCandidateCanPublish(), false);
  assert.equal(workflowPublishCandidateCanExecute(), false);
  assert.equal(workflowPublishCandidateCanGrantAuthority(), false);
});

test('workflow publish candidate rejects identity change and non-increasing version', () => {
  assert.throws(
    () =>
      prepareFhKuikaWorkflowPublishCandidateV1({
        previous,
        next: { ...next, id: 'other-flow' },
      }),
    /preserve workflow id/,
  );

  assert.throws(
    () =>
      prepareFhKuikaWorkflowPublishCandidateV1({
        previous,
        next: { ...next, version: '1.0.0' },
      }),
    /version must increase monotonically/,
  );
});
