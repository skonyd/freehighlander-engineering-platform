import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaWorkflowDraftV1,
  parseFhKuikaWorkflowDraftV1,
  serializeFhKuikaWorkflowDraftV1,
  validateFhKuikaWorkflowDraftDefinitionV1,
  workflowStudioDraftCanExecute,
  workflowStudioDraftCanGrantAuthority,
  workflowStudioDraftCanPublishDirectly,
} from '../dist/index.js';

function definition() {
  return {
    id: 'feature-review',
    version: '1.0.0',
    nodes: [
      { id: 'plan', kind: 'MODEL', role: 'planner' },
      { id: 'implement', kind: 'MODEL', role: 'implementation-agent' },
      { id: 'verify', kind: 'GATE' },
      { id: 'human', kind: 'HUMAN' },
    ],
    edges: [
      { from: 'plan', to: 'implement' },
      { from: 'implement', to: 'verify' },
      { from: 'verify', to: 'human' },
    ],
  };
}

test('Workflow Studio draft round-trips canonical definition without authority', () => {
  const input = definition();
  const draft = createFhKuikaWorkflowDraftV1({
    draftId: 'draft-1',
    canonicalDefinition: input,
  });

  const parsed = parseFhKuikaWorkflowDraftV1(serializeFhKuikaWorkflowDraftV1(draft));

  assert.deepEqual(parsed, draft);
  assert.deepEqual(parsed.canonicalDefinition, input);
  assert.notEqual(parsed.canonicalDefinition, input);
  assert.equal(parsed.authority, 'NONE');
  assert.equal(parsed.publishAuthorized, false);
  assert.equal(parsed.executionAuthorized, false);
  assert.equal(workflowStudioDraftCanGrantAuthority(), false);
  assert.equal(workflowStudioDraftCanPublishDirectly(), false);
  assert.equal(workflowStudioDraftCanExecute(), false);
});

test('Workflow Studio draft rejects invalid graph structure and unbounded loops', () => {
  const invalid = {
    id: 'invalid',
    version: '1.0.0',
    nodes: [
      { id: 'loop', kind: 'LOOP' },
      { id: 'review', kind: 'MODEL' },
    ],
    edges: [
      { from: 'loop', to: 'review' },
      { from: 'review', to: 'loop' },
    ],
  };

  const result = validateFhKuikaWorkflowDraftDefinitionV1(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.requiresCanonicalPublishValidation, true);
  assert.ok(result.errors.some((error) => error.includes('maxIterations')));
  assert.ok(result.errors.includes('workflow graph must be acyclic'));
});

test('Workflow Studio draft rejects unknown edges and duplicate identities', () => {
  const invalid = {
    id: 'invalid',
    version: '1.0.0',
    nodes: [
      { id: 'same', kind: 'MODEL' },
      { id: 'same', kind: 'GATE' },
    ],
    edges: [
      { from: 'same', to: 'missing' },
      { from: 'same', to: 'missing' },
    ],
  };

  const result = validateFhKuikaWorkflowDraftDefinitionV1(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate workflow node id')));
  assert.ok(result.errors.some((error) => error.includes('unknown workflow edge target')));
  assert.ok(result.errors.some((error) => error.includes('duplicate workflow edge')));
});

test('parsed Studio payload cannot self-promote publish or execution authority', () => {
  const draft = createFhKuikaWorkflowDraftV1({
    draftId: 'draft-1',
    canonicalDefinition: definition(),
  });
  const raw = JSON.parse(serializeFhKuikaWorkflowDraftV1(draft));
  raw.publishAuthorized = true;

  assert.throws(
    () => parseFhKuikaWorkflowDraftV1(JSON.stringify(raw)),
    /publishAuthorized must be false/,
  );
});

test('Workflow Studio preserves bounded inspector metadata through round-trip', () => {
  const input = definition();
  input.nodes[0] = {
    ...input.nodes[0],
    riskTier: 'HIGH',
    timeoutMs: 120000,
    retryLimit: 2,
    tokenBudget: 50000,
    costBudgetUsd: 10,
    requiredEvidence: ['plan-evidence', 'architecture-review'],
    toolPermissions: ['repo.read', 'issue.read'],
    approvalPolicy: 'MODEL_QUORUM_REQUIRED',
  };

  const draft = createFhKuikaWorkflowDraftV1({
    draftId: 'draft-inspector',
    canonicalDefinition: input,
  });
  const parsed = parseFhKuikaWorkflowDraftV1(serializeFhKuikaWorkflowDraftV1(draft));
  const node = parsed.canonicalDefinition.nodes[0];

  assert.equal(node.riskTier, 'HIGH');
  assert.equal(node.timeoutMs, 120000);
  assert.equal(node.retryLimit, 2);
  assert.equal(node.tokenBudget, 50000);
  assert.equal(node.costBudgetUsd, 10);
  assert.deepEqual(node.requiredEvidence, ['plan-evidence', 'architecture-review']);
  assert.deepEqual(node.toolPermissions, ['repo.read', 'issue.read']);
  assert.equal(node.approvalPolicy, 'MODEL_QUORUM_REQUIRED');
});

test('Workflow Studio inspector metadata validation fails closed on invalid budgets and policy', () => {
  const input = definition();
  input.nodes[0] = {
    ...input.nodes[0],
    timeoutMs: 0,
    retryLimit: 99,
    tokenBudget: -1,
    costBudgetUsd: Number.NaN,
    requiredEvidence: ['same', 'same'],
    toolPermissions: [''],
    approvalPolicy: 'BYPASS',
  };

  const result = validateFhKuikaWorkflowDraftDefinitionV1(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('timeoutMs')));
  assert.ok(result.errors.some((error) => error.includes('retryLimit')));
  assert.ok(result.errors.some((error) => error.includes('tokenBudget')));
  assert.ok(result.errors.some((error) => error.includes('costBudgetUsd')));
  assert.ok(result.errors.some((error) => error.includes('requiredEvidence')));
  assert.ok(result.errors.some((error) => error.includes('toolPermissions')));
  assert.ok(result.errors.some((error) => error.includes('approvalPolicy')));
});


test('Workflow Studio validation exposes categorized node and graph issues', () => {
  const invalid = {
    id: 'validation-demo',
    version: '1.0.0',
    nodes: [
      {
        id: 'model-1',
        kind: 'MODEL',
        tokenBudget: -1,
        requiredEvidence: ['same', 'same'],
      },
      { id: 'loop-1', kind: 'LOOP' },
    ],
    edges: [
      { from: 'model-1', to: 'missing-node' },
      { from: 'loop-1', to: 'loop-1' },
    ],
  };

  const result = validateFhKuikaWorkflowDraftDefinitionV1(invalid);

  assert.equal(result.valid, false);
  assert.ok(result.issues.length >= 4);
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.category === 'BUDGET' &&
        issue.nodeId === 'model-1' &&
        issue.message.includes('tokenBudget'),
    ),
  );
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.category === 'EVIDENCE' &&
        issue.nodeId === 'model-1' &&
        issue.message.includes('requiredEvidence'),
    ),
  );
  assert.ok(
    result.issues.some((issue) => issue.category === 'LOOP_BOUND' && issue.nodeId === 'loop-1'),
  );
  assert.ok(result.issues.some((issue) => issue.category === 'REFERENCE'));
});
