import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildManagementSnapshot,
  createManagementIntent,
  parseManagementIntent,
  uiDisconnectCanChangeWorkflowExecution,
  webCanExecuteManagementIntent,
} from '../dist/index.js';

const run = {
  runId: 'run-1',
  taskId: 'task-1',
  firstTimestamp: '2026-09-20T07:00:00.000Z',
  lastTimestamp: '2026-09-20T07:01:00.000Z',
  status: 'HUMAN_REQUIRED',
  repository: 'skonyd/freehighlander-engineering-platform',
  pullRequest: 55,
  branch: 'feat/test',
  headSha: 'abc',
  workflowId: 'review',
  workflowVersion: '1.0.0',
  humanRequired: true,
  eventCount: 2,
  modelCallCount: 1,
};

const source = {
  summary: () => ({
    runs: 1,
    humanRequiredRuns: 1,
    modelCalls: 1,
    totalTokens: 100,
    inputTokens: 60,
    cachedInputTokens: 20,
    outputTokens: 30,
    reasoningTokens: 10,
    estimatedCostUsd: 0.01,
    actualCostUsd: 0.01,
    averageModelLatencyMs: 100,
  }),
  listRuns: () => [run],
  listEvents: () => [
    {
      type: 'human.required',
      timestamp: '2026-09-20T07:00:30.000Z',
      nodeId: 'approve',
      nodeType: 'HUMAN',
      status: 'HUMAN_REQUIRED',
      result: null,
      failureClass: null,
      event: { action: 'merge' },
    },
  ],
  listArtifacts: () => [
    {
      artifactId: 'artifact-1',
      firstSeenTimestamp: '2026-09-20T07:00:10.000Z',
      lastSeenTimestamp: '2026-09-20T07:00:10.000Z',
      state: 'current',
    },
  ],
  listModelCalls: () => [
    {
      timestamp: '2026-09-20T07:00:20.000Z',
      logicalRole: 'test-reviewer',
      bindingId: 'binding',
      provider: 'local',
      model: 'model',
      effort: 'medium',
      status: 'PASS',
      result: 'PASS',
      durationMs: 100,
      retryCount: 0,
      fallbackCount: 0,
      failureClass: null,
      inputTokens: 60,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningTokens: 10,
      totalTokens: 100,
      estimatedCostUsd: 0.01,
      actualCostUsd: 0.01,
    },
  ],
};

test('management snapshot is deterministic, client-only and shadow-authority', () => {
  const first = buildManagementSnapshot(source);
  const second = buildManagementSnapshot(source);

  assert.deepEqual(first, second);
  assert.equal(first.mode, 'client-only-management');
  assert.equal(first.executionOwner, 'control-plane');
  assert.equal(first.mutationAuthority, 'none');
  assert.equal(first.v3Authority, 'SHADOW_ONLY');
  assert.equal(first.runs[0].humanApprovals[0].status, 'HUMAN_REQUIRED');
});

test('management intents are explicit requests for control-plane authority', () => {
  const intent = createManagementIntent({
    kind: 'REQUEST_HUMAN_DECISION',
    runId: 'run-1',
    exactHeadSha: 'abc',
    reason: 'operator reviewed evidence',
  });

  assert.equal(intent.authority, 'CONTROL_PLANE_REQUIRED');
  assert.equal(webCanExecuteManagementIntent(), false);
  assert.equal(uiDisconnectCanChangeWorkflowExecution(), false);
});

test('unknown management actions and malformed intents fail closed', () => {
  assert.throws(
    () =>
      parseManagementIntent({
        kind: 'APPROVE_DIRECTLY',
        runId: 'run-1',
        reason: 'no',
      }),
    /unknown management intent kind/,
  );

  assert.throws(
    () =>
      createManagementIntent({
        kind: 'REQUEST_RUN_CANCEL',
        runId: '',
        reason: 'operator request',
      }),
    /runId is required/,
  );
});
