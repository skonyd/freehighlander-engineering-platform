import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaStudioWorkflowDraftV1,
  fhKuikaWorkflowStudioDraftCanGrantAuthority,
  fhKuikaWorkflowStudioDraftCanInvokeModel,
  fhKuikaWorkflowStudioDraftCanMutateRuntime,
  fhKuikaWorkflowStudioDraftCanPublish,
  parseFhKuikaStudioWorkflowDraftV1,
  roundTripFhKuikaStudioWorkflowDraftV1,
  serializeFhKuikaStudioWorkflowDraftV1,
} from '../dist/index.js';

function definition(overrides = {}) {
  return {
    id: 'feature-review',
    version: '1.0.0',
    nodes: [
      { id: 'plan', kind: 'MODEL', role: 'architecture-reviewer' },
      { id: 'implement', kind: 'MODEL', role: 'implementation-agent' },
      { id: 'review', kind: 'GATE' },
    ],
    edges: [
      { from: 'plan', to: 'implement' },
      { from: 'implement', to: 'review' },
    ],
    ...overrides,
  };
}

test('Workflow Studio draft canonicalizes and round-trips without semantic loss', () => {
  const first = createFhKuikaStudioWorkflowDraftV1(definition());
  const reordered = createFhKuikaStudioWorkflowDraftV1(
    definition({
      nodes: [...definition().nodes].reverse(),
      edges: [...definition().edges].reverse(),
    }),
  );

  assert.equal(first.status, 'DRAFT');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.draftHash.length, 64);
  assert.equal(first.draftHash, reordered.draftHash);
  assert.deepEqual(roundTripFhKuikaStudioWorkflowDraftV1(first), first);
  assert.deepEqual(
    parseFhKuikaStudioWorkflowDraftV1(JSON.parse(serializeFhKuikaStudioWorkflowDraftV1(first))),
    first,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.definition), true);

  assert.equal(fhKuikaWorkflowStudioDraftCanInvokeModel(), false);
  assert.equal(fhKuikaWorkflowStudioDraftCanMutateRuntime(), false);
  assert.equal(fhKuikaWorkflowStudioDraftCanGrantAuthority(), false);
  assert.equal(fhKuikaWorkflowStudioDraftCanPublish(), false);
});

test('Workflow Studio validation accepts bounded LOOP and rejects invalid graph semantics', () => {
  const loop = createFhKuikaStudioWorkflowDraftV1({
    id: 'bounded-loop',
    version: '1.0.0',
    nodes: [
      { id: 'loop', kind: 'LOOP', maxIterations: 3 },
      { id: 'done', kind: 'GATE' },
    ],
    edges: [{ from: 'loop', to: 'done' }],
  });
  assert.equal(loop.definition.nodes.find((node) => node.id === 'loop').maxIterations, 3);

  assert.throws(
    () =>
      createFhKuikaStudioWorkflowDraftV1({
        id: 'unbounded-loop',
        version: '1.0.0',
        nodes: [{ id: 'loop', kind: 'LOOP' }],
        edges: [],
      }),
    /maxIterations/,
  );

  assert.throws(
    () =>
      createFhKuikaStudioWorkflowDraftV1({
        id: 'cycle',
        version: '1.0.0',
        nodes: [
          { id: 'a', kind: 'MODEL' },
          { id: 'b', kind: 'GATE' },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
      }),
    /acyclic/,
  );

  assert.throws(
    () =>
      createFhKuikaStudioWorkflowDraftV1({
        id: 'unknown-edge',
        version: '1.0.0',
        nodes: [{ id: 'a', kind: 'MODEL' }],
        edges: [{ from: 'a', to: 'missing' }],
      }),
    /unknown workflow edge target/,
  );
});

test('Workflow Studio parser fails closed on authority, mutation-like tampering and hash drift', () => {
  const draft = createFhKuikaStudioWorkflowDraftV1(definition());

  assert.throws(
    () => parseFhKuikaStudioWorkflowDraftV1({ ...draft, authority: 'WRITER' }),
    /authority must be NONE/,
  );
  assert.throws(
    () => parseFhKuikaStudioWorkflowDraftV1({ ...draft, status: 'PUBLISHED' }),
    /status must be DRAFT/,
  );
  assert.throws(
    () => parseFhKuikaStudioWorkflowDraftV1({ ...draft, draftHash: '0'.repeat(64) }),
    /hash mismatch/,
  );
});

test('Workflow Studio supports all canonical node kinds without granting runtime semantics', () => {
  const kinds = [
    'MODEL',
    'COMMAND',
    'GATE',
    'CONDITION',
    'PARALLEL',
    'AGGREGATE',
    'DEBATE',
    'HUMAN',
    'SUBWORKFLOW',
  ];
  const nodes = kinds.map((kind, index) => ({ id: 'node-' + index, kind }));
  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index].id,
    to: node.id,
  }));

  const draft = createFhKuikaStudioWorkflowDraftV1({
    id: 'node-kinds',
    version: '1.0.0',
    nodes,
    edges,
  });

  assert.deepEqual(draft.definition.nodes.map((node) => node.kind).sort(), [...kinds].sort());
});
