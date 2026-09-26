import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaWorkflowNodeInspectorV1,
  workflowInspectorCanGrantAuthority,
  workflowInspectorCanInventUnsupportedFields,
  workflowInspectorCanMutateRuntime,
} from '../dist/index.js';

test('Workflow inspector resolves only fields present in canonical WorkflowSpec v1', () => {
  const model = buildFhKuikaWorkflowNodeInspectorV1({
    id: 'review',
    kind: 'MODEL',
    role: 'test-reviewer',
  });

  assert.equal(model.authority, 'NONE');
  assert.equal(model.runtimeMutationAuthorized, false);
  assert.equal(model.fields.role.value, 'test-reviewer');
  assert.equal(model.fields.role.resolution, 'RESOLVED');
  assert.equal(model.fields.loopBound.resolution, 'NOT_APPLICABLE');

  for (const field of [
    model.fields.budget,
    model.fields.evidence,
    model.fields.policy,
    model.fields.toolPermissions,
  ]) {
    assert.equal(field.value, null);
    assert.equal(field.resolution, 'UNRESOLVED_IN_CANONICAL_V1');
    assert.equal(field.source, 'PUBLISH_VALIDATION');
  }

  assert.equal(workflowInspectorCanGrantAuthority(), false);
  assert.equal(workflowInspectorCanMutateRuntime(), false);
  assert.equal(workflowInspectorCanInventUnsupportedFields(), false);
});

test('Workflow inspector exposes bounded loop only when canonical node contains it', () => {
  const loop = buildFhKuikaWorkflowNodeInspectorV1({
    id: 'repair-loop',
    kind: 'LOOP',
    maxIterations: 3,
  });

  assert.equal(loop.fields.loopBound.value, 3);
  assert.equal(loop.fields.loopBound.resolution, 'RESOLVED');
  assert.equal(loop.fields.role.resolution, 'NOT_APPLICABLE');
});
