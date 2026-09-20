import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRunSnapshot,
  createInitialNodeStates,
  propagateWorkflowStates,
  publishWorkflow,
  transitionNodeState,
  workflowConfigurationCanGrantAuthority,
} from '../dist/index.js';

const definition = {
  id: 'review-flow',
  version: '1.0.0',
  nodes: [
    { id: 'collect', kind: 'COMMAND' },
    { id: 'review', kind: 'MODEL', role: 'test-reviewer' },
    { id: 'gate', kind: 'GATE' },
  ],
  edges: [
    { from: 'collect', to: 'review' },
    { from: 'review', to: 'gate' },
  ],
};

test('workflow publication is deterministic and input-order independent', () => {
  const first = publishWorkflow(definition);
  const second = publishWorkflow({
    ...definition,
    nodes: [...definition.nodes].reverse(),
    edges: [...definition.edges].reverse(),
  });

  assert.equal(first.workflowHash, second.workflowHash);
  assert.deepEqual(
    first.definition.nodes.map((node) => node.id),
    ['collect', 'gate', 'review'],
  );
});

test('invalid references, duplicates and cycles fail closed', () => {
  assert.throws(
    () =>
      publishWorkflow({
        ...definition,
        edges: [{ from: 'missing', to: 'review' }],
      }),
    /unknown workflow edge source/,
  );

  assert.throws(
    () =>
      publishWorkflow({
        ...definition,
        nodes: [...definition.nodes, { id: 'review', kind: 'MODEL' }],
      }),
    /duplicate workflow node id/,
  );

  assert.throws(
    () =>
      publishWorkflow({
        ...definition,
        edges: [...definition.edges, { from: 'gate', to: 'collect' }],
      }),
    /acyclic/,
  );
});

test('LOOP nodes are explicit and bounded while graph edges remain acyclic', () => {
  assert.throws(
    () =>
      publishWorkflow({
        id: 'loop-flow',
        version: '1.0.0',
        nodes: [{ id: 'retry', kind: 'LOOP' }],
        edges: [],
      }),
    /maxIterations >= 1/,
  );

  assert.doesNotThrow(() =>
    publishWorkflow({
      id: 'loop-flow',
      version: '1.0.0',
      nodes: [{ id: 'retry', kind: 'LOOP', maxIterations: 2 }],
      edges: [],
    }),
  );
});

test('roots become READY and successful predecessors unlock dependents', () => {
  const workflow = publishWorkflow(definition);
  let states = createInitialNodeStates(workflow);

  assert.deepEqual(states, {
    collect: 'READY',
    gate: 'PENDING',
    review: 'PENDING',
  });

  states = transitionNodeState(states, 'collect', 'RUNNING');
  states = transitionNodeState(states, 'collect', 'PASSED');
  states = propagateWorkflowStates(workflow, states);

  assert.equal(states.review, 'READY');
  assert.equal(states.gate, 'PENDING');

  states = transitionNodeState(states, 'review', 'RUNNING');
  states = transitionNodeState(states, 'review', 'PASSED');
  states = propagateWorkflowStates(workflow, states);

  assert.equal(states.gate, 'READY');
});

test('failed or blocked predecessors deterministically block dependents', () => {
  const workflow = publishWorkflow(definition);
  let states = createInitialNodeStates(workflow);
  states = transitionNodeState(states, 'collect', 'RUNNING');
  states = transitionNodeState(states, 'collect', 'FAILED');
  states = propagateWorkflowStates(workflow, states);

  assert.equal(states.review, 'BLOCKED');
  assert.equal(states.gate, 'BLOCKED');
});

test('illegal and unknown transitions fail closed', () => {
  const workflow = publishWorkflow(definition);
  const states = createInitialNodeStates(workflow);

  assert.throws(
    () => transitionNodeState(states, 'collect', 'PASSED'),
    /illegal workflow transition/,
  );
  assert.throws(
    () => transitionNodeState(states, 'missing', 'READY'),
    /unknown workflow node state/,
  );
});

test('run snapshot binds workflow, roles, policy, bindings and provider capabilities', () => {
  const workflow = publishWorkflow(definition);
  const input = {
    workflow,
    roleVersions: {
      reviewer: 'test-reviewer@1.0.0',
      collector: 'repo-analyst@1.0.0',
    },
    policyHash: 'policy-v1',
    resolvedBindings: {
      reviewer: 'binding-review@1.0.0',
    },
    providerCapabilitySnapshot: {
      qwen: ['usage_token_breakdown', 'streaming'],
      openai: ['structured_output', 'streaming'],
    },
  };

  const first = buildRunSnapshot(input);
  const second = buildRunSnapshot({
    ...input,
    roleVersions: {
      collector: 'repo-analyst@1.0.0',
      reviewer: 'test-reviewer@1.0.0',
    },
    providerCapabilitySnapshot: {
      openai: ['streaming', 'structured_output'],
      qwen: ['streaming', 'usage_token_breakdown'],
    },
  });

  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.notEqual(
    first.snapshotHash,
    buildRunSnapshot({ ...input, policyHash: 'policy-v2' }).snapshotHash,
  );
});

test('workflow configuration cannot grant authority', () => {
  assert.equal(workflowConfigurationCanGrantAuthority(), false);
});
