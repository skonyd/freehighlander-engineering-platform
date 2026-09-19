import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SqliteTelemetryStore } from '../dist/index.js';

function event(type, timestamp, overrides = {}) {
  return {
    schemaVersion: 1,
    type,
    timestamp,
    runId: 'run-1',
    taskId: 'task-1',
    revision: {
      repository: 'skonyd/freehighlander-engineering-platform',
      pullRequest: 23,
      branch: 'feat/test',
      baseSha: 'base',
      headSha: 'head',
    },
    workflow: {
      id: 'pr-review',
      version: '1.0.0',
      hash: 'workflow-hash',
    },
    payload: {},
    ...overrides,
  };
}

test('SQLite schema migrates to version 1 and indexes a complete run', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-'));
  const dbPath = path.join(root, 'state', 'telemetry.sqlite');
  const store = new SqliteTelemetryStore(dbPath);

  try {
    assert.equal(store.schemaVersion(), 1);

    const events = [
      event('run.started', '2026-09-19T20:00:00.000Z'),
      event('model.call.completed', '2026-09-19T20:00:01.000Z', {
        model: {
          logicalRole: 'test-reviewer',
          bindingId: 'opus-medium',
          provider: 'claude-cli',
          model: 'opus',
          effort: 'medium',
        },
        execution: {
          status: 'PASS',
          result: 'SUFFICIENT',
          durationMs: 1500,
          retryCount: 1,
          fallbackCount: 0,
        },
        usage: {
          inputTokens: 100,
          cachedInputTokens: 25,
          outputTokens: 30,
          reasoningTokens: 10,
          totalTokens: 140,
          estimatedCostUsd: 0.1,
        },
        artifactIds: ['test-review-artifact'],
      }),
      event('artifact.created', '2026-09-19T20:00:02.000Z', {
        artifactIds: ['test-review-artifact'],
      }),
      event('human.required', '2026-09-19T20:00:03.000Z'),
      event('run.completed', '2026-09-19T20:00:04.000Z', {
        execution: { status: 'PASSED' },
      }),
    ];

    assert.deepEqual(store.ingestMany(events), {
      seen: 5,
      inserted: 5,
      duplicates: 0,
    });

    const run = store.getRun('run-1');
    assert.ok(run);
    assert.equal(run.status, 'PASSED');
    assert.equal(run.humanRequired, true);
    assert.equal(run.eventCount, 5);
    assert.equal(run.modelCallCount, 1);
    assert.equal(run.workflowHash, 'workflow-hash');
    assert.equal(run.headSha, 'head');

    const calls = store.listModelCalls('run-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.logicalRole, 'test-reviewer');
    assert.equal(calls[0]?.model, 'opus');
    assert.equal(calls[0]?.totalTokens, 140);
    assert.equal(calls[0]?.retryCount, 1);

    const artifacts = store.listArtifacts('run-1');
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0]?.artifactId, 'test-review-artifact');
    assert.equal(artifacts[0]?.state, 'CREATED');

    assert.equal(store.listEvents('run-1').length, 5);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('event ingestion is idempotent by canonical event hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-idempotent-'));
  const store = new SqliteTelemetryStore(path.join(root, 'telemetry.sqlite'));

  try {
    const started = event('run.started', '2026-09-19T20:00:00.000Z');

    assert.equal(store.ingest(started), true);
    assert.equal(store.ingest(started), false);

    const run = store.getRun('run-1');
    assert.equal(run?.eventCount, 1);
    assert.equal(store.listEvents('run-1').length, 1);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('JSONL import is repeatable without duplicate read-model rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-import-'));
  const dbPath = path.join(root, 'telemetry.sqlite');
  const jsonlPath = path.join(root, 'events.jsonl');

  const events = [
    event('run.started', '2026-09-19T20:00:00.000Z'),
    event('run.completed', '2026-09-19T20:00:01.000Z', {
      execution: { result: 'PASS' },
    }),
  ];
  await writeFile(jsonlPath, `${events.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');

  const store = new SqliteTelemetryStore(dbPath);
  try {
    assert.deepEqual(store.importJsonl(jsonlPath), {
      seen: 2,
      inserted: 2,
      duplicates: 0,
    });
    assert.deepEqual(store.importJsonl(jsonlPath), {
      seen: 2,
      inserted: 0,
      duplicates: 2,
    });
    assert.equal(store.getRun('run-1')?.eventCount, 2);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('artifact lifecycle keeps the latest specific state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-artifact-'));
  const store = new SqliteTelemetryStore(path.join(root, 'telemetry.sqlite'));

  try {
    store.ingest(
      event('artifact.created', '2026-09-19T20:00:00.000Z', {
        artifactIds: ['artifact-1'],
      }),
    );
    store.ingest(
      event('model.call.completed', '2026-09-19T20:00:01.000Z', {
        artifactIds: ['artifact-1'],
      }),
    );
    store.ingest(
      event('artifact.invalidated', '2026-09-19T20:00:02.000Z', {
        artifactIds: ['artifact-1'],
      }),
    );

    assert.equal(store.listArtifacts('run-1')[0]?.state, 'INVALIDATED');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('corrupt JSONL is rejected before any events are indexed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-corrupt-'));
  const store = new SqliteTelemetryStore(path.join(root, 'telemetry.sqlite'));
  const jsonlPath = path.join(root, 'events.jsonl');

  try {
    await writeFile(jsonlPath, `${JSON.stringify(event('run.started', '2026-09-19T20:00:00.000Z'))}\n`);
    await appendFile(jsonlPath, '{broken}\n', 'utf8');

    assert.throws(() => store.importJsonl(jsonlPath), /line 2/);
    assert.equal(store.listRuns().length, 0);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('out-of-order older events do not overwrite latest run status', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-sqlite-order-'));
  const store = new SqliteTelemetryStore(path.join(root, 'telemetry.sqlite'));

  try {
    store.ingest(
      event('run.completed', '2026-09-19T20:00:05.000Z', {
        execution: { status: 'PASSED' },
      }),
    );
    store.ingest(event('human.required', '2026-09-19T20:00:03.000Z'));

    const run = store.getRun('run-1');
    assert.equal(run?.status, 'PASSED');
    assert.equal(run?.humanRequired, true);
    assert.equal(run?.lastTimestamp, '2026-09-19T20:00:05.000Z');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
