import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaWorkflowVersionDiffV1,
  prepareFhKuikaWorkflowPublicationCandidateV1,
  workflowPublicationCandidateCanExecute,
  workflowPublicationCandidateCanGrantAuthority,
  workflowPublicationCandidateCanPublish,
} from '../dist/index.js';

function definition(overrides = {}) {
  return {
    id: 'feature-review',
    version: '1.1.0',
    nodes: [
      {
        id: 'review',
        kind: 'MODEL',
        role: 'reviewer',
        riskTier: 'HIGH',
        tokenBudget: 20000,
        requiredEvidence: ['test-results'],
        toolPermissions: ['repo.read'],
        approvalPolicy: 'MODEL_QUORUM_REQUIRED',
      },
      { id: 'gate', kind: 'GATE', approvalPolicy: 'HUMAN_REQUIRED' },
    ],
    edges: [{ from: 'review', to: 'gate' }],
    ...overrides,
  };
}

test('publication candidate exact-binds validated workflow without granting publish authority', () => {
  const candidate = prepareFhKuikaWorkflowPublicationCandidateV1(null, definition());

  assert.equal(candidate.schemaVersion, 1);
  assert.equal(candidate.workflowId, 'feature-review');
  assert.equal(candidate.workflowVersion, '1.1.0');
  assert.equal(candidate.workflowHash.length, 64);
  assert.equal(candidate.validation.valid, true);
  assert.equal(candidate.simulationReady, true);
  assert.equal(candidate.status, 'READY_FOR_CORE_PUBLICATION_REVIEW');
  assert.equal(candidate.publicationAuthorized, false);
  assert.equal(candidate.executionAuthorized, false);
  assert.equal(candidate.authority, 'NONE');
  assert.equal(workflowPublicationCandidateCanPublish(), false);
  assert.equal(workflowPublicationCandidateCanExecute(), false);
  assert.equal(workflowPublicationCandidateCanGrantAuthority(), false);
});

test('publication candidate hash is deterministic across node evidence/tool ordering', () => {
  const first = prepareFhKuikaWorkflowPublicationCandidateV1(null, definition());
  const second = prepareFhKuikaWorkflowPublicationCandidateV1(
    null,
    definition({
      nodes: [
        {
          ...definition().nodes[0],
          requiredEvidence: ['test-results'],
          toolPermissions: ['repo.read'],
        },
        definition().nodes[1],
      ],
    }),
  );

  assert.equal(first.workflowHash, second.workflowHash);
});

test('workflow diff detects policy, risk, budget, evidence and tool changes', () => {
  const before = definition({ version: '1.0.0' });
  const after = definition({
    nodes: [
      {
        ...definition().nodes[0],
        riskTier: 'CRITICAL',
        tokenBudget: 30000,
        requiredEvidence: ['security-review'],
        toolPermissions: ['repo.read', 'security.read'],
        approvalPolicy: 'HUMAN_REQUIRED',
      },
      definition().nodes[1],
    ],
  });

  const diff = buildFhKuikaWorkflowVersionDiffV1(before, after);

  assert.equal(diff.nodeChanges.length, 1);
  assert.equal(diff.nodeChanges[0].nodeId, 'review');
  assert.equal(diff.nodeChanges[0].change, 'CHANGED');
  assert.equal(diff.nodeChanges[0].authoritySensitive, true);
  assert.equal(diff.authoritySensitiveChange, true);
  assert.equal(diff.publishAuthorized, false);
});

test('invalid draft produces blocked publication candidate', () => {
  const candidate = prepareFhKuikaWorkflowPublicationCandidateV1(
    null,
    definition({
      nodes: [{ id: 'loop', kind: 'LOOP' }],
      edges: [],
    }),
  );

  assert.equal(candidate.validation.valid, false);
  assert.equal(candidate.simulationReady, false);
  assert.equal(candidate.status, 'BLOCKED');
  assert.equal(candidate.publicationAuthorized, false);
});
