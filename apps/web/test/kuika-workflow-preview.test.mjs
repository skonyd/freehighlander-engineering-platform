import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaWorkflowReplayPreviewV1,
  simulateFhKuikaWorkflowDraftV1,
  workflowReplayPreviewCanExecute,
  workflowReplayPreviewCanGrantAuthority,
  workflowReplayPreviewCanInvokeModel,
  workflowStudioSimulationCanExecute,
  workflowStudioSimulationCanGrantAuthority,
} from '../dist/index.js';

const run = {
  runId: 'run-1',
  taskId: 'task-1',
  firstTimestamp: '2026-09-26T08:00:00.000Z',
  lastTimestamp: '2026-09-26T08:02:00.000Z',
  status: 'PASSED',
  repository: 'skonyd/freehighlander-engineering-platform',
  pullRequest: null,
  branch: 'main',
  headSha: 'a'.repeat(40),
  workflowId: 'feature-review',
  workflowVersion: '1.0.0',
  humanRequired: false,
  eventCount: 2,
  modelCallCount: 0,
};

test('Workflow Studio simulation is deterministic preview with no execution authority', () => {
  const definition = {
    id: 'feature-review',
    version: '1.0.0',
    nodes: [
      { id: 'plan', kind: 'MODEL', role: 'planner' },
      { id: 'gate', kind: 'GATE' },
    ],
    edges: [{ from: 'plan', to: 'gate' }],
  };

  const first = simulateFhKuikaWorkflowDraftV1(definition);
  const second = simulateFhKuikaWorkflowDraftV1(definition);

  assert.deepEqual(first, second);
  assert.equal(first.valid, true);
  assert.equal(first.terminalState, 'READY_FOR_CANONICAL_REVIEW');
  assert.deepEqual(
    first.orderedSteps.map((step) => step.nodeId),
    ['plan', 'gate'],
  );
  assert.equal(first.executionAuthorized, false);
  assert.equal(workflowStudioSimulationCanExecute(), false);
  assert.equal(workflowStudioSimulationCanGrantAuthority(), false);
});

test('recorded replay preview reads existing events without replaying execution', () => {
  const source = {
    getRun: (runId) => (runId === 'run-1' ? run : null),
    listEvents: () => [
      {
        type: 'run.started',
        timestamp: '2026-09-26T08:00:00.000Z',
        nodeId: null,
        nodeType: null,
        status: 'RUNNING',
        result: null,
        failureClass: null,
        event: {},
      },
      {
        type: 'node.completed',
        timestamp: '2026-09-26T08:01:00.000Z',
        nodeId: 'plan',
        nodeType: 'MODEL',
        status: 'PASS',
        result: 'PASS',
        failureClass: null,
        event: {},
      },
    ],
  };

  const preview = buildFhKuikaWorkflowReplayPreviewV1(source, 'run-1');

  assert.ok(preview);
  assert.equal(preview.runId, 'run-1');
  assert.equal(preview.workflowId, 'feature-review');
  assert.equal(preview.exactRevision, 'a'.repeat(40));
  assert.equal(preview.recordedSteps.length, 2);
  assert.equal(preview.recordedSteps[1].nodeId, 'plan');
  assert.equal(preview.source, 'RECORDED_EVENTS');
  assert.equal(preview.replayPerformed, false);
  assert.equal(preview.executionAuthorized, false);
  assert.equal(preview.authority, 'NONE');
  assert.equal(workflowReplayPreviewCanExecute(), false);
  assert.equal(workflowReplayPreviewCanInvokeModel(), false);
  assert.equal(workflowReplayPreviewCanGrantAuthority(), false);
});

test('recorded replay preview fails safely for unknown run and invalid limits', () => {
  const source = {
    getRun: () => null,
    listEvents: () => {
      throw new Error('events must not be read for missing run');
    },
  };

  assert.equal(buildFhKuikaWorkflowReplayPreviewV1(source, 'missing'), null);
  assert.throws(() => buildFhKuikaWorkflowReplayPreviewV1(source, ''), /runId is required/);
  assert.throws(
    () => buildFhKuikaWorkflowReplayPreviewV1(source, 'run-1', 0),
    /eventLimit must be an integer/,
  );
});
