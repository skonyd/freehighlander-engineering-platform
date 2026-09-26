import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaWorkflowSimulationPreviewV1,
  buildFhKuikaWorkflowValidationViewV1,
  createFhKuikaWorkflowNodeInspectorV1,
  workflowInspectorAnnotationsCanGrantAuthority,
  workflowSimulationPreviewCanExecute,
  workflowValidationViewCanPublishDirectly,
} from '../dist/index.js';

const definition = {
  id: 'feature-flow',
  version: '1.0.0',
  nodes: [
    { id: 'plan', kind: 'MODEL', role: 'planner' },
    { id: 'implement', kind: 'COMMAND' },
    { id: 'review', kind: 'GATE' },
  ],
  edges: [
    { from: 'plan', to: 'implement' },
    { from: 'implement', to: 'review' },
  ],
};

test('Workflow Studio inspector annotations are bounded and non-authoritative', () => {
  const inspector = createFhKuikaWorkflowNodeInspectorV1({
    node: definition.nodes[0],
    riskTier: 'HIGH',
    timeoutMs: 30_000,
    retryLimit: 1,
    tokenBudget: 20_000,
    costBudgetUsd: 2.5,
    timeBudgetMs: 60_000,
    requiredEvidence: ['plan-output'],
    toolPermissions: ['repository.read'],
    sandboxPolicyRef: 'sandbox:read-only',
    approvalPolicy: 'MODEL_QUORUM_REQUIRED',
  });

  assert.equal(inspector.nodeId, 'plan');
  assert.equal(inspector.logicalRole, 'planner');
  assert.equal(inspector.authority, 'NONE');
  assert.equal(inspector.runtimeAuthoritative, false);
  assert.deepEqual(inspector.requiredEvidence, ['plan-output']);

  assert.throws(
    () =>
      createFhKuikaWorkflowNodeInspectorV1({
        node: definition.nodes[0],
        riskTier: 'CRITICAL',
        approvalPolicy: 'NONE',
      }),
    /CRITICAL.*approval policy/,
  );
  assert.equal(workflowInspectorAnnotationsCanGrantAuthority(), false);
});

test('Workflow Studio validation maps canonical and annotation issues deterministically', () => {
  const inspector = createFhKuikaWorkflowNodeInspectorV1({
    node: definition.nodes[0],
    riskTier: 'HIGH',
    approvalPolicy: 'MODEL_QUORUM_REQUIRED',
  });
  const view = buildFhKuikaWorkflowValidationViewV1(definition, [inspector]);

  assert.equal(view.valid, true);
  assert.equal(view.authority, 'NONE');
  assert.equal(view.canonicalPublishValidationRequired, true);
  assert.equal(view.issues.length, 1);
  assert.equal(view.issues[0]?.category, 'EVIDENCE');
  assert.equal(view.issues[0]?.severity, 'WARNING');

  const unknown = { ...inspector, nodeId: 'missing' };
  const invalid = buildFhKuikaWorkflowValidationViewV1(definition, [unknown]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.category === 'REFERENCE'));
});

test('Workflow Studio simulation preview never executes and preserves topological order', () => {
  const preview = buildFhKuikaWorkflowSimulationPreviewV1(definition);

  assert.equal(preview.valid, true);
  assert.deepEqual(
    preview.nodes.map((node) => node.nodeId),
    ['plan', 'implement', 'review'],
  );
  assert.ok(preview.nodes.every((node) => node.state === 'NOT_EXECUTED'));
  assert.equal(preview.requiresCoreReplaySimulation, true);
  assert.equal(preview.executionAuthorized, false);
  assert.equal(preview.authority, 'NONE');
  assert.equal(workflowSimulationPreviewCanExecute(), false);
  assert.equal(workflowValidationViewCanPublishDirectly(), false);
});

test('Workflow Studio inspector rejects invalid budgets and multiline identifiers', () => {
  assert.throws(
    () =>
      createFhKuikaWorkflowNodeInspectorV1({
        node: definition.nodes[0],
        retryLimit: -1,
      }),
    /retryLimit/,
  );
  assert.throws(
    () =>
      createFhKuikaWorkflowNodeInspectorV1({
        node: definition.nodes[0],
        toolPermissions: ['repo.read\nrepo.write'],
      }),
    /bounded single-line/,
  );
});
