import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { DashboardReadModel, dashboardRefreshCanInvokeModel } from '../dist/index.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-provider-home-'));
  const file = path.join(root, 'telemetry.sqlite');
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (1, '2026-09-26T05:00:00.000Z');

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
    'run-home',
    'task-home',
    '2026-09-26T05:30:00.000Z',
    '2026-09-26T06:40:00.000Z',
    'PASSED',
    'skonyd/freehighlander-engineering-platform',
    null,
    'main',
    'base',
    'head',
    'implementation',
    '1.0.0',
    'wf-hash',
    0,
    1,
    0,
    'run.completed',
  );

  return {
    root,
    file,
    db,
    cleanup: async () => {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function insertEvent(db, { hash, type, timestamp, event }) {
  db.prepare(
    `INSERT INTO events(
       event_hash, schema_version, type, timestamp, run_id, event_json
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(hash, 1, type, timestamp, event.runId, JSON.stringify(event));
}

function insertModelCall(db, input) {
  db.prepare(
    `INSERT INTO model_calls VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )`,
  ).run(
    input.hash,
    'run-home',
    input.timestamp,
    'implementation',
    input.bindingId,
    input.provider,
    input.model,
    'medium',
    'PASS',
    'SUFFICIENT',
    100,
    0,
    input.fallbackCount ?? 0,
    null,
    10,
    0,
    0,
    5,
    0,
    15,
    0.001,
    0.001,
  );
}

test('Core Home projects preferred binding, active fallback, quota recovery time and provider health', async () => {
  const data = await fixture();
  try {
    insertEvent(data.db, {
      hash: 'binding-publication',
      type: 'model.binding.changed',
      timestamp: '2026-09-26T06:00:00.000Z',
      event: {
        schemaVersion: 1,
        type: 'model.binding.changed',
        timestamp: '2026-09-26T06:00:00.000Z',
        runId: 'binding-management',
        payload: {
          action: 'BINDING_CHANGE',
          providerId: 'anthropic',
          modelId: 'anthropic/opus-5.5',
          bindingId: 'opus',
          logicalRole: 'implementation',
          riskTier: 'NORMAL',
          currentHash: 'a'.repeat(64),
          currentState: 'opus@1.0.0',
          itemCount: 3,
          fallbackBindingIds: ['gpt', 'gemini'],
          returnPolicy: 'ASK_BEFORE_RETURN',
        },
      },
    });

    const nextProbeAt = '2026-09-26T08:00:00.000Z';
    insertEvent(data.db, {
      hash: 'provider-open',
      type: 'provider.circuit.opened',
      timestamp: '2026-09-26T06:05:00.000Z',
      event: {
        schemaVersion: 1,
        type: 'provider.circuit.opened',
        timestamp: '2026-09-26T06:05:00.000Z',
        runId: 'provider-health',
        provider: {
          id: 'anthropic',
          available: false,
          circuitState: 'OPEN',
          failureKind: 'quota_exhausted',
          nextProbeAtMs: Date.parse(nextProbeAt),
        },
        payload: { reason: 'quota exhausted' },
      },
    });

    insertModelCall(data.db, {
      hash: 'fallback-call',
      timestamp: '2026-09-26T06:06:00.000Z',
      bindingId: 'gpt',
      provider: 'openai',
      model: 'gpt-6',
      fallbackCount: 1,
    });

    const model = new DashboardReadModel(data.file);
    assert.equal(dashboardRefreshCanInvokeModel(), false);
    let home = model.homeSnapshot({ now: '2026-09-26T07:00:00.000Z' });

    assert.equal(home.system.providers, 'DEGRADED');
    assert.equal(home.system.state, 'DEGRADED');
    assert.ok(!home.sourceFreshness.staleSources.includes('provider-state'));
    assert.equal(home.sourceFreshness.providerStateUpdatedAt, '2026-09-26T06:05:00.000Z');

    assert.equal(home.roleBindings.length, 1);
    const fallback = home.roleBindings[0];
    assert.equal(fallback.logicalRole, 'implementation');
    assert.equal(fallback.state, 'FALLBACK_ACTIVE');
    assert.equal(fallback.preferredBindingId, 'opus');
    assert.equal(fallback.preferredModel, 'anthropic/opus-5.5');
    assert.equal(fallback.activeBindingId, 'gpt');
    assert.equal(fallback.activeModel, 'gpt-6');
    assert.equal(fallback.providerId, 'openai');
    assert.equal(fallback.failureKind, 'quota_exhausted');
    assert.equal(fallback.nextCheckAt, nextProbeAt);
    assert.equal(fallback.returnPolicy, 'ASK_BEFORE_RETURN');

    insertEvent(data.db, {
      hash: 'provider-recovered',
      type: 'provider.health.checked',
      timestamp: '2026-09-26T06:30:00.000Z',
      event: {
        schemaVersion: 1,
        type: 'provider.health.checked',
        timestamp: '2026-09-26T06:30:00.000Z',
        runId: 'provider-health',
        provider: {
          id: 'anthropic',
          available: true,
          circuitState: 'CLOSED',
        },
        payload: { status: 'available' },
      },
    });

    insertModelCall(data.db, {
      hash: 'preferred-call',
      timestamp: '2026-09-26T06:31:00.000Z',
      bindingId: 'opus',
      provider: 'anthropic',
      model: 'anthropic/opus-5.5',
    });

    home = model.homeSnapshot({ now: '2026-09-26T07:00:00.000Z' });
    assert.equal(home.system.providers, 'HEALTHY');
    assert.equal(home.system.state, 'UNKNOWN');
    assert.equal(home.sourceFreshness.providerStateUpdatedAt, '2026-09-26T06:30:00.000Z');

    const recovered = home.roleBindings[0];
    assert.equal(recovered.state, 'ACTIVE');
    assert.equal(recovered.activeBindingId, 'opus');
    assert.equal(recovered.activeModel, 'anthropic/opus-5.5');
    assert.equal(recovered.providerId, 'anthropic');
    assert.equal(recovered.failureKind, undefined);
    assert.equal(recovered.nextCheckAt, undefined);
  } finally {
    await data.cleanup();
  }
});

test('Core Home leaves provider and binding state unknown when deterministic provider data is absent', async () => {
  const data = await fixture();
  try {
    const model = new DashboardReadModel(data.file);
    const home = model.homeSnapshot({ now: '2026-09-26T07:00:00.000Z' });

    assert.equal(home.system.providers, 'UNKNOWN');
    assert.deepEqual(home.roleBindings, []);
    assert.ok(home.sourceFreshness.staleSources.includes('provider-state'));
  } finally {
    await data.cleanup();
  }
});
