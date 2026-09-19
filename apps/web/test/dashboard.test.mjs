import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  DashboardReadModel,
  MissingDashboardDatabaseError,
  createDashboardServer,
} from '../dist/index.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-dashboard-'));
  const file = path.join(root, 'telemetry.sqlite');
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (1, '2026-09-19T20:00:00.000Z');

    CREATE TABLE runs(
      run_id TEXT PRIMARY KEY, task_id TEXT, first_timestamp TEXT NOT NULL, last_timestamp TEXT NOT NULL,
      status TEXT, repository TEXT, pull_request INTEGER, branch TEXT, base_sha TEXT, head_sha TEXT,
      workflow_id TEXT, workflow_version TEXT, workflow_hash TEXT, human_required INTEGER NOT NULL,
      event_count INTEGER NOT NULL, model_call_count INTEGER NOT NULL, last_event_type TEXT NOT NULL
    ) STRICT;

    CREATE TABLE events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_hash TEXT NOT NULL UNIQUE, schema_version INTEGER NOT NULL,
      type TEXT NOT NULL, timestamp TEXT NOT NULL, run_id TEXT NOT NULL, task_id TEXT,
      workflow_id TEXT, workflow_version TEXT, workflow_hash TEXT, node_id TEXT, node_type TEXT,
      logical_role TEXT, binding_id TEXT, provider TEXT, model TEXT, effort TEXT, status TEXT, result TEXT,
      duration_ms INTEGER, retry_count INTEGER, fallback_count INTEGER, failure_class TEXT,
      input_tokens INTEGER, cached_input_tokens INTEGER, cache_write_tokens INTEGER, output_tokens INTEGER,
      reasoning_tokens INTEGER, total_tokens INTEGER, estimated_cost_usd REAL, actual_cost_usd REAL,
      budget_scope TEXT, budget_action TEXT, event_json TEXT NOT NULL
    ) STRICT;

    CREATE TABLE model_calls(
      event_hash TEXT PRIMARY KEY, run_id TEXT NOT NULL, timestamp TEXT NOT NULL, logical_role TEXT,
      binding_id TEXT, provider TEXT, model TEXT, effort TEXT, status TEXT, result TEXT,
      duration_ms INTEGER, retry_count INTEGER, fallback_count INTEGER, failure_class TEXT,
      input_tokens INTEGER, cached_input_tokens INTEGER, cache_write_tokens INTEGER, output_tokens INTEGER,
      reasoning_tokens INTEGER, total_tokens INTEGER, estimated_cost_usd REAL, actual_cost_usd REAL
    ) STRICT;

    CREATE TABLE artifacts(
      artifact_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, first_seen_timestamp TEXT NOT NULL,
      last_seen_timestamp TEXT NOT NULL, state TEXT NOT NULL, last_event_hash TEXT NOT NULL
    ) STRICT;
  `);

  db.prepare(`INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'run-1',
    'task-1',
    '2026-09-19T20:00:00.000Z',
    '2026-09-19T20:00:03.000Z',
    'PASSED',
    'skonyd/freehighlander-engineering-platform',
    25,
    'feat/test',
    'base',
    'head',
    'pr-review',
    '1.0.0',
    'wf-hash',
    1,
    3,
    1,
    'run.completed',
  );

  const rawEvent = {
    schemaVersion: 1,
    type: 'run.started',
    timestamp: '2026-09-19T20:00:00.000Z',
    runId: 'run-1',
    payload: {},
  };
  db.prepare(
    `INSERT INTO events(
      event_hash, schema_version, type, timestamp, run_id, event_json
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('event-1', 1, 'run.started', rawEvent.timestamp, 'run-1', JSON.stringify(rawEvent));

  db.prepare(
    `INSERT INTO model_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'event-model',
    'run-1',
    '2026-09-19T20:00:01.000Z',
    'test-reviewer',
    'opus-medium',
    'claude-cli',
    'opus',
    'medium',
    'PASS',
    'SUFFICIENT',
    1500,
    1,
    0,
    null,
    100,
    20,
    0,
    30,
    10,
    140,
    0.1,
    0.09,
  );

  db.prepare(`INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?)`).run(
    'artifact-1',
    'run-1',
    '2026-09-19T20:00:01.000Z',
    '2026-09-19T20:00:02.000Z',
    'CREATED',
    'event-model',
  );
  db.close();

  return {
    root,
    file,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test('dashboard read model exposes summary, runs, model usage and artifacts', async () => {
  const data = await fixture();
  try {
    const model = new DashboardReadModel(data.file);
    assert.deepEqual(model.health(), { databaseExists: true, schemaVersion: 1 });

    const summary = model.summary();
    assert.equal(summary.runs, 1);
    assert.equal(summary.humanRequiredRuns, 1);
    assert.equal(summary.modelCalls, 1);
    assert.equal(summary.totalTokens, 140);
    assert.equal(summary.actualCostUsd, 0.09);
    assert.equal(summary.averageModelLatencyMs, 1500);

    assert.equal(model.listRuns()[0]?.runId, 'run-1');
    assert.equal(model.modelAggregates()[0]?.logicalRole, 'test-reviewer');

    const detail = model.runDetail('run-1');
    assert.ok(detail);
    assert.equal(detail.run.status, 'PASSED');
    assert.equal(detail.events.length, 1);
    assert.equal(detail.modelCalls.length, 1);
    assert.equal(detail.artifacts[0]?.artifactId, 'artifact-1');
  } finally {
    await data.cleanup();
  }
});

test('missing database is reported without creating it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-dashboard-missing-'));
  const file = path.join(root, 'does-not-exist.sqlite');

  try {
    const model = new DashboardReadModel(file);
    assert.deepEqual(model.health(), { databaseExists: false, schemaVersion: null });
    assert.throws(() => model.summary(), MissingDashboardDatabaseError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('HTTP dashboard is read-only and serves health/summary/run APIs', async () => {
  const data = await fixture();
  const server = createDashboardServer({ databasePath: data.file });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Engineering Telemetry/);
    assert.equal(home.headers.get('x-freehighlander-mode'), 'read-only');

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.mode, 'read-only');
    assert.equal(health.schemaVersion, 1);

    const summary = await (await fetch(`${base}/api/summary`)).json();
    assert.equal(summary.totalTokens, 140);

    const run = await (await fetch(`${base}/api/runs/run-1`)).json();
    assert.equal(run.run.runId, 'run-1');
    assert.equal(run.modelCalls.length, 1);

    const denied = await fetch(`${base}/api/runs`, { method: 'POST' });
    assert.equal(denied.status, 405);
    assert.equal((await denied.json()).error, 'read_only_dashboard');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await data.cleanup();
  }
});

test('missing database keeps health available and returns 503 for data endpoints', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-dashboard-http-missing-'));
  const file = path.join(root, 'missing.sqlite');
  const server = createDashboardServer({ databasePath: file });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.status, 'waiting_for_database');

    const summary = await fetch(`${base}/api/summary`);
    assert.equal(summary.status, 503);
    assert.equal((await summary.json()).error, 'database_not_ready');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
