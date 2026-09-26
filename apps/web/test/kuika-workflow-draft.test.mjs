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
