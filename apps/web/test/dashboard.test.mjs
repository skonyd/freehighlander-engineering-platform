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

  const economyEvent = {
    schemaVersion: 1,
    type: 'economy.runtime.summary',
    timestamp: '2026-09-19T20:00:02.000Z',
    runId: 'run-1',
    payload: {
      mode: 'TOKEN_ECONOMY',
      optimizerBindingId: 'local-optimizer',
      optimizerModelId: 'local-model',
      remoteTokenTarget: 80,
      candidateRemoteInputTokens: 100,
      finalRemoteInputTokens: 60,
      remoteOutputTokens: 30,
      cachedInputTokens: 20,
      reductionStages: ['DETERMINISTIC_REDUCTION', 'REPOSITORY_JIT'],
      protectedContentCount: 2,
      localOptimizationDurationMs: 25,
      remoteTokenSavingRatio: 0.4,
      roleEligibility: [
        {
          logicalRole: 'context-optimizer',
          riskTier: 'NORMAL',
          eligible: true,
        },
      ],
      authority: 'NONE',
    },
  };
  db.prepare(
    `INSERT INTO events(
      event_hash, schema_version, type, timestamp, run_id, event_json
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    'event-economy',
    1,
    'economy.runtime.summary',
    economyEvent.timestamp,
    'run-1',
    JSON.stringify(economyEvent),
  );

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

function insertHumanEvent(file, input) {
  const db = new DatabaseSync(file);
  try {
    if (input.createRun) {
      const insertRun = db.prepare(
        `INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertRun.run(
        input.runId,
        'task-human',
        input.timestamp,
        input.timestamp,
        input.status,
        'skonyd/freehighlander-engineering-platform',
        26,
        'feat/human',
        'base-human',
        'head-human',
        'human-workflow',
        '1.0.0',
        'wf-human',
        1,
        1,
        0,
        input.type,
      );
    }

    const event = {
      schemaVersion: 1,
      type: input.type,
      timestamp: input.timestamp,
      runId: input.runId,
      taskId: 'task-human',
      node: { id: input.nodeId, type: 'HUMAN' },
      execution: { status: input.status },
      payload: input.payload,
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, task_id,
        node_id, node_type, status, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      1,
      input.type,
      input.timestamp,
      input.runId,
      'task-human',
      input.nodeId,
      'HUMAN',
      input.status,
      JSON.stringify(event),
    );
  } finally {
    db.close();
  }
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

    const home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.schemaVersion, 1);
    assert.equal(home.projectionAuthority, 'NONE');
    assert.equal(home.project.repository, 'skonyd/freehighlander-engineering-platform');
    assert.equal(home.project.branch, 'feat/test');
    assert.equal(home.project.headSha, 'head');
    assert.equal(home.system.database, 'HEALTHY');
    assert.equal(home.system.providers, 'UNKNOWN');
    assert.equal(home.usage.window, 'TODAY');
    assert.equal(home.usage.modelCalls, 1);
    assert.equal(home.usage.totalTokens, 140);
    assert.equal(home.usage.actualCostUsd, 0.09);
    assert.equal(home.economy.mode, 'TOKEN_ECONOMY');
    assert.equal(home.economy.finalRemoteInputTokens, 60);
    assert.equal(home.economy.remoteTokenSavingRatio, 0.4);
    assert.equal(home.economy.authority, 'NONE');
    assert.equal(home.recentRuns[0]?.runId, 'run-1');
    assert.equal(home.findings.state, 'UNKNOWN');
    assert.ok(home.sourceFreshness.staleSources.includes('provider-state'));

    const last24Hours = model.usageWindow('LAST_24H', {
      now: '2026-09-19T23:00:00.000Z',
    });
    assert.equal(last24Hours.modelCalls, 1);

    const last7Days = model.usageWindow('LAST_7D', {
      now: '2026-09-19T23:00:00.000Z',
    });
    assert.equal(last7Days.totalTokens, 140);

    const runUsage = model.usageWindow('CURRENT_RUN', {
      runId: 'run-1',
      now: '2026-09-19T23:00:00.000Z',
    });
    assert.equal(runUsage.totalTokens, 140);

    const projectUsage = model.usageWindow('CURRENT_PROJECT', {
      repository: 'skonyd/freehighlander-engineering-platform',
      now: '2026-09-19T23:00:00.000Z',
    });
    assert.equal(projectUsage.modelCalls, 1);

    assert.throws(
      () => model.usageWindow('CURRENT_RUN', { now: '2026-09-19T23:00:00.000Z' }),
      /CURRENT_RUN usage requires runId/,
    );
    assert.throws(
      () => model.usageWindow('CURRENT_PROJECT', { now: '2026-09-19T23:00:00.000Z' }),
      /CURRENT_PROJECT usage requires repository/,
    );

    const detail = model.runDetail('run-1');
    assert.ok(detail);
    assert.equal(detail.run.status, 'PASSED');
    assert.equal(detail.events.length, 2);
    assert.equal(detail.modelCalls.length, 1);
    assert.equal(detail.artifacts[0]?.artifactId, 'artifact-1');
  } finally {
    await data.cleanup();
  }
});

test('Core Home projects current work and only unresolved human approvals', async () => {
  const data = await fixture();
  try {
    insertHumanEvent(data.file, {
      createRun: true,
      eventHash: 'human-required-1',
      type: 'human.required',
      timestamp: '2026-09-19T21:00:00.000Z',
      runId: 'run-human',
      nodeId: 'approve-change',
      status: 'HUMAN_REQUIRED',
      payload: {
        decisionId: 'decision-1',
        reason: 'Approve the exact revision before continuing.',
      },
    });

    const model = new DashboardReadModel(data.file);
    let home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });

    assert.equal(home.currentWork?.runId, 'run-human');
    assert.equal(home.currentWork?.state, 'WAITING_HUMAN');
    assert.equal(home.currentWork?.nodeId, 'approve-change');
    assert.equal(home.attention.total, 1);
    assert.equal(home.attention.items[0]?.kind, 'HUMAN_APPROVAL');
    assert.equal(
      home.attention.items[0]?.nextAction,
      'Approve the exact revision before continuing.',
    );
    assert.ok(!home.sourceFreshness.staleSources.includes('current-work'));
    assert.ok(home.sourceFreshness.staleSources.includes('runtime-attention'));

    insertHumanEvent(data.file, {
      createRun: false,
      eventHash: 'human-decision-stale',
      type: 'human.decision',
      timestamp: '2026-09-19T21:01:00.000Z',
      runId: 'run-human',
      nodeId: 'approve-change',
      status: 'STALE',
      payload: { decisionId: 'decision-1' },
    });

    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'WAITING_HUMAN');
    assert.equal(home.attention.total, 1);
    assert.equal(home.attention.items[0]?.headline, 'Human approval response is stale');

    insertHumanEvent(data.file, {
      createRun: false,
      eventHash: 'human-decision-resolved',
      type: 'human.decision',
      timestamp: '2026-09-19T21:02:00.000Z',
      runId: 'run-human',
      nodeId: 'approve-change',
      status: 'RESUME_READY',
      payload: { decisionId: 'decision-1' },
    });

    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.attention.total, 0);
    assert.equal(home.currentWork?.state, 'UNKNOWN');

    insertHumanEvent(data.file, {
      createRun: false,
      eventHash: 'human-required-fallback',
      type: 'human.required',
      timestamp: '2026-09-19T21:03:00.000Z',
      runId: 'run-human',
      nodeId: 'approve-fallback',
      status: 'HUMAN_REQUIRED',
      payload: {},
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.attention.total, 1);

    insertHumanEvent(data.file, {
      createRun: false,
      eventHash: 'human-decision-fallback',
      type: 'human.decision',
      timestamp: '2026-09-19T21:04:00.000Z',
      runId: 'run-human',
      nodeId: 'approve-fallback',
      status: 'RESUME_READY',
      payload: {},
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.attention.total, 0);
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
    const homeHtml = await home.text();
    assert.match(homeHtml, /FreeHighlander · Core Home/);
    assert.match(homeHtml, /ZERO-TOKEN HOME/);
    assert.match(homeHtml, /Active models/);
    assert.match(homeHtml, /Token Economy/);
    assert.match(homeHtml, /id="economy"/);
    assert.match(homeHtml, /role-bindings/);
    assert.match(homeHtml, /\/api\/home/);
    assert.equal(home.headers.get('x-freehighlander-mode'), 'read-only');

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.mode, 'read-only');
    assert.equal(health.schemaVersion, 1);

    const homeSnapshot = await (await fetch(`${base}/api/home`)).json();
    assert.equal(homeSnapshot.schemaVersion, 1);
    assert.equal(homeSnapshot.projectionAuthority, 'NONE');
    assert.equal(homeSnapshot.project.repository, 'skonyd/freehighlander-engineering-platform');
    assert.equal(homeSnapshot.economy.mode, 'TOKEN_ECONOMY');
    assert.equal(homeSnapshot.economy.authority, 'NONE');

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

    const home = await fetch(`${base}/api/home`);
    assert.equal(home.status, 503);
    assert.equal((await home.json()).error, 'database_not_ready');

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
