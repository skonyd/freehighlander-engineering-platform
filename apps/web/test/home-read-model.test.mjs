import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCoreHomeSnapshot, dashboardRefreshCanInvokeModel } from '../dist/index.js';

const run = {
  runId: 'run-2',
  taskId: 'task-2',
  firstTimestamp: '2026-09-26T06:00:00.000Z',
  lastTimestamp: '2026-09-26T06:50:00.000Z',
  status: 'RUNNING',
  repository: 'skonyd/freehighlander-engineering-platform',
  pullRequest: null,
  branch: 'feat/home',
  headSha: 'abc123',
  workflowId: 'implementation',
  workflowVersion: '1.0.0',
  humanRequired: false,
  eventCount: 4,
  modelCallCount: 2,
};

test('Core Home aggregate uses deterministic local reads and does not infer missing state', () => {
  const source = {
    health: () => ({ databaseExists: true, schemaVersion: 1 }),
    listRuns: () => [run],
    usageSince: () => ({
      modelCalls: 2,
      inputTokens: 100,
      cachedInputTokens: 10,
      outputTokens: 40,
      reasoningTokens: 5,
      totalTokens: 145,
      estimatedCostUsd: 0.03,
      actualCostUsd: 0.025,
      retries: 0,
      fallbacks: 0,
    }),
  };

  const snapshot = buildCoreHomeSnapshot(source, {
    now: new Date('2026-09-26T07:00:00.000Z'),
  });

  assert.equal(snapshot.project.exactRevision, 'abc123');
  assert.equal(snapshot.recentRuns[0].runId, 'run-2');
  assert.equal(snapshot.usage.totalTokens, 145);
  assert.equal(snapshot.usage.window, 'LAST_24_HOURS');
  assert.equal(snapshot.currentWork, null);
  assert.deepEqual(snapshot.roleBindings, []);
  assert.equal(snapshot.continuity.state, 'UNKNOWN');
  assert.equal(dashboardRefreshCanInvokeModel(), false);
});

test('Core Home aggregate marks unavailable local storage as unknown instead of guessing', () => {
  const source = {
    health: () => ({ databaseExists: false, schemaVersion: null }),
    listRuns: () => {
      throw new Error('must not read missing database');
    },
    usageSince: () => {
      throw new Error('must not read missing database');
    },
  };

  const snapshot = buildCoreHomeSnapshot(source, {
    now: new Date('2026-09-26T07:00:00.000Z'),
  });

  assert.equal(snapshot.system.state, 'UNKNOWN');
  assert.equal(snapshot.system.databaseReady, false);
  assert.deepEqual(snapshot.sourceFreshness.staleSources, ['sqlite']);
  assert.equal(snapshot.usage.totalTokens, 0);
});
