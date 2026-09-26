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

function insertCurrentWorkFixture(file, input) {
  const db = new DatabaseSync(file);
  try {
    db.prepare(`INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.runId,
      input.taskId ?? 'task-work',
      input.timestamp,
      input.timestamp,
      input.status ?? 'ACTIVE',
      'skonyd/freehighlander-engineering-platform',
      null,
      input.branch ?? 'feat/current-work',
      'base-work',
      input.headSha ?? 'head-work',
      input.workflowId,
      '1.0.0',
      'wf-work',
      0,
      1,
      0,
      input.eventType,
    );

    const event = {
      schemaVersion: 1,
      type: input.eventType,
      timestamp: input.timestamp,
      runId: input.runId,
      taskId: input.taskId ?? 'task-work',
      ...(input.nodeId ? { node: { id: input.nodeId, type: input.nodeType ?? 'MODEL' } } : {}),
      execution: { status: input.status ?? 'ACTIVE' },
      payload: {},
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, task_id,
        node_id, node_type, status, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'event-' + input.runId,
      1,
      input.eventType,
      input.timestamp,
      input.runId,
      input.taskId ?? 'task-work',
      input.nodeId ?? null,
      input.nodeType ?? null,
      input.status ?? 'ACTIVE',
      JSON.stringify(event),
    );
  } finally {
    db.close();
  }
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

function insertBindingChange(file, input) {
  const db = new DatabaseSync(file);
  try {
    const event = {
      schemaVersion: 1,
      type: 'model.binding.changed',
      timestamp: input.timestamp,
      runId: 'run-1',
      payload: {
        action: 'BINDING_CHANGE',
        providerId: input.providerId,
        modelId: input.modelId,
        bindingId: input.bindingId,
        logicalRole: input.logicalRole,
        currentHash: input.currentHash ?? 'a'.repeat(64),
        fallbackBindingIds: input.fallbackBindingIds ?? [],
        returnPolicy: input.returnPolicy,
      },
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, event_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      1,
      'model.binding.changed',
      input.timestamp,
      'run-1',
      JSON.stringify(event),
    );
  } finally {
    db.close();
  }
}

function insertProviderState(file, input) {
  const db = new DatabaseSync(file);
  try {
    const provider = {
      id: input.providerId,
      ...(input.available === undefined ? {} : { available: input.available }),
      ...(input.circuitState === undefined ? {} : { circuitState: input.circuitState }),
      ...(input.failureKind === undefined ? {} : { failureKind: input.failureKind }),
      ...(input.retryAfterMs === undefined ? {} : { retryAfterMs: input.retryAfterMs }),
      ...(input.nextProbeAtMs === undefined ? {} : { nextProbeAtMs: input.nextProbeAtMs }),
    };
    const event = {
      schemaVersion: 1,
      type: input.type,
      timestamp: input.timestamp,
      runId: 'run-1',
      provider,
      payload: {},
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, event_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(input.eventHash, 1, input.type, input.timestamp, 'run-1', JSON.stringify(event));
  } finally {
    db.close();
  }
}

function insertModelCall(file, input) {
  const db = new DatabaseSync(file);
  try {
    db.prepare(
      `INSERT INTO model_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      'run-1',
      input.timestamp,
      input.logicalRole,
      input.bindingId,
      input.providerId,
      input.modelId,
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
  } finally {
    db.close();
  }
}

function insertRuntimeErrorEvent(file, input) {
  const db = new DatabaseSync(file);
  try {
    const event = {
      schemaVersion: 1,
      type: 'runtime.error.reported',
      timestamp: input.timestamp,
      runId: input.runId,
      taskId: input.taskId ?? 'task-runtime',
      node: { id: input.nodeId ?? 'implementation-agent', type: 'MODEL' },
      execution: { status: 'FAILED' },
      payload: {
        code: input.code ?? 'PROVIDER_QUOTA_EXHAUSTED',
        severity: input.severity,
        retryable: input.retryable ?? true,
        correlationId: input.correlationId,
        causeCode: input.causeCode ?? 'quota_exhausted',
        causeKind: input.causeKind ?? 'QUOTA_EXHAUSTED',
        certainty: 'CONFIRMED_SIGNAL',
        headline: input.headline,
        sourceComponent: input.sourceComponent ?? 'model-runtime',
        sourceOperation: input.sourceOperation ?? 'provider-call',
        failedStep: input.failedStep ?? 'Invoke preferred provider',
        rootCause: input.rootCause ?? 'Provider quota is exhausted.',
        observedSignal: input.observedSignal ?? 'Quota exhaustion signal received.',
        nextAction: input.nextAction ?? 'Continue with the configured eligible fallback.',
        ...(input.retryAt ? { retryAt: input.retryAt } : {}),
        redactionStatus: 'NOT_REQUIRED',
        safeForUserDisplay: true,
      },
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, task_id,
        node_id, node_type, status, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      1,
      'runtime.error.reported',
      input.timestamp,
      input.runId,
      input.taskId ?? 'task-runtime',
      input.nodeId ?? 'implementation-agent',
      'MODEL',
      'FAILED',
      JSON.stringify(event),
    );
  } finally {
    db.close();
  }
}

function insertBudgetEvent(file, input) {
  const db = new DatabaseSync(file);
  try {
    const event = {
      schemaVersion: 1,
      type: input.type,
      timestamp: input.timestamp,
      runId: input.runId,
      taskId: input.taskId ?? 'task-runtime',
      budget: {
        scope: input.scope,
        action: input.action,
      },
      payload: {},
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, task_id,
        budget_scope, budget_action, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      1,
      input.type,
      input.timestamp,
      input.runId,
      input.taskId ?? 'task-runtime',
      input.scope,
      input.action,
      JSON.stringify(event),
    );
  } finally {
    db.close();
  }
}

function insertCheckpointEvent(file, input) {
  const db = new DatabaseSync(file);
  try {
    const event = {
      schemaVersion: 1,
      type: 'checkpoint.created',
      timestamp: input.timestamp,
      runId: 'run-1',
      revision: {
        repository: 'skonyd/freehighlander-engineering-platform',
        branch: 'feat/test',
        headSha: input.sourceRevision,
      },
      payload: {
        ...(input.resumeReady === undefined ? {} : { resumeReady: input.resumeReady }),
        ...(input.warning === undefined ? {} : { warning: input.warning }),
      },
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, event_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      1,
      'checkpoint.created',
      input.timestamp,
      'run-1',
      JSON.stringify(event),
    );
  } finally {
    db.close();
  }
}

function insertFindingEvent(file, input) {
  const db = new DatabaseSync(file);
  try {
    const event = {
      schemaVersion: 1,
      type: 'finding.adjudicated',
      timestamp: input.timestamp,
      runId: 'run-1',
      revision: {
        repository: 'skonyd/freehighlander-engineering-platform',
        branch: 'feat/test',
        headSha: input.revision,
      },
      payload: {
        findingId: input.findingId,
        severity: input.severity,
        state: input.state,
      },
    };

    db.prepare(
      `INSERT INTO events(
        event_hash, schema_version, type, timestamp, run_id, event_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.eventHash,
      1,
      'finding.adjudicated',
      input.timestamp,
      'run-1',
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
    assert.ok(!home.sourceFreshness.staleSources.includes('runtime-attention'));

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

test('Core Home current work uses deterministic stage taxonomy and provider wait state', async () => {
  const data = await fixture();
  try {
    insertCurrentWorkFixture(data.file, {
      runId: 'run-plan',
      timestamp: '2026-09-19T21:10:00.000Z',
      eventType: 'node.started',
      nodeId: 'architecture-plan',
      nodeType: 'MODEL',
      workflowId: 'feature-planning',
    });

    const model = new DashboardReadModel(data.file);
    let home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'PLANNING');
    assert.equal(home.currentWork?.classificationVersion, 1);

    insertCurrentWorkFixture(data.file, {
      runId: 'run-implement',
      timestamp: '2026-09-19T21:11:00.000Z',
      eventType: 'node.started',
      nodeId: 'implementation-agent',
      nodeType: 'MODEL',
      workflowId: 'feature-delivery',
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'IMPLEMENTING');

    insertCurrentWorkFixture(data.file, {
      runId: 'run-test',
      timestamp: '2026-09-19T21:12:00.000Z',
      eventType: 'node.started',
      nodeId: 'acceptance-test',
      nodeType: 'COMMAND',
      workflowId: 'feature-delivery',
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'TESTING');

    insertCurrentWorkFixture(data.file, {
      runId: 'run-security',
      timestamp: '2026-09-19T21:13:00.000Z',
      eventType: 'node.started',
      nodeId: 'security-review',
      nodeType: 'MODEL',
      workflowId: 'release-review',
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'SECURITY_REVIEW');

    insertCurrentWorkFixture(data.file, {
      runId: 'run-review',
      timestamp: '2026-09-19T21:14:00.000Z',
      eventType: 'node.started',
      nodeId: 'independent-review',
      nodeType: 'MODEL',
      workflowId: 'release',
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'REVIEW');

    insertCurrentWorkFixture(data.file, {
      runId: 'run-provider-wait',
      timestamp: '2026-09-19T21:15:00.000Z',
      eventType: 'quota.exhausted',
      nodeId: null,
      nodeType: null,
      workflowId: 'release',
      status: 'RETRYING',
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'WAITING_PROVIDER');

    insertCurrentWorkFixture(data.file, {
      runId: 'run-unknown-stage',
      timestamp: '2026-09-19T21:16:00.000Z',
      eventType: 'node.started',
      nodeId: 'opaque-stage',
      nodeType: 'MODEL',
      workflowId: 'custom-flow',
    });
    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    assert.equal(home.currentWork?.state, 'UNKNOWN');
  } finally {
    await data.cleanup();
  }
});

test('Core Home projects preferred, fallback, recovery timing and return policy', async () => {
  const data = await fixture();
  try {
    insertBindingChange(data.file, {
      eventHash: 'binding-security',
      timestamp: '2026-09-19T21:20:00.000Z',
      providerId: 'claude-cli',
      modelId: 'opus-5',
      bindingId: 'security-opus',
      logicalRole: 'security-reviewer',
      fallbackBindingIds: ['security-gpt'],
      returnPolicy: 'ASK_BEFORE_RETURN',
    });
    insertProviderState(data.file, {
      eventHash: 'provider-healthy',
      type: 'provider.health.checked',
      timestamp: '2026-09-19T21:20:10.000Z',
      providerId: 'claude-cli',
      available: true,
      circuitState: 'CLOSED',
    });
    insertModelCall(data.file, {
      eventHash: 'preferred-call',
      timestamp: '2026-09-19T21:20:20.000Z',
      logicalRole: 'security-reviewer',
      bindingId: 'security-opus',
      providerId: 'claude-cli',
      modelId: 'opus-5',
    });

    const model = new DashboardReadModel(data.file);
    let home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    let binding = home.roleBindings.find((item) => item.logicalRole === 'security-reviewer');

    assert.equal(home.system.providers, 'HEALTHY');
    assert.equal(binding?.state, 'ACTIVE');
    assert.equal(binding?.preferredBindingId, 'security-opus');
    assert.equal(binding?.activeBindingId, 'security-opus');
    assert.equal(binding?.preferredModel, 'opus-5');
    assert.equal(binding?.activeModel, 'opus-5');
    assert.equal(binding?.returnPolicy, 'ASK_BEFORE_RETURN');
    assert.equal(home.attention.total, 0);

    insertProviderState(data.file, {
      eventHash: 'provider-quota',
      type: 'quota.exhausted',
      timestamp: '2026-09-19T21:21:00.000Z',
      providerId: 'claude-cli',
      available: false,
      failureKind: 'quota',
      retryAfterMs: 60000,
    });
    insertModelCall(data.file, {
      eventHash: 'fallback-call',
      timestamp: '2026-09-19T21:21:10.000Z',
      logicalRole: 'security-reviewer',
      bindingId: 'security-gpt',
      providerId: 'openai-cli',
      modelId: 'gpt-6',
      fallbackCount: 1,
    });

    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    binding = home.roleBindings.find((item) => item.logicalRole === 'security-reviewer');

    assert.equal(home.system.providers, 'DEGRADED');
    assert.equal(home.sourceFreshness.providerStateUpdatedAt, '2026-09-19T21:21:00.000Z');
    assert.equal(binding?.state, 'FALLBACK_ACTIVE');
    assert.equal(binding?.preferredBindingId, 'security-opus');
    assert.equal(binding?.activeBindingId, 'security-gpt');
    assert.equal(binding?.activeModel, 'gpt-6');
    assert.equal(binding?.providerId, 'openai-cli');
    assert.equal(binding?.failureKind, 'quota');
    assert.equal(binding?.nextCheckAt, '2026-09-19T21:22:00.000Z');
    assert.equal(binding?.returnPolicy, 'ASK_BEFORE_RETURN');
    const providerAttention = home.attention.items.find(
      (item) => item.kind === 'QUOTA_WAIT' || item.kind === 'PROVIDER_FALLBACK',
    );
    assert.ok(providerAttention);
    assert.equal(providerAttention.severity, 'WARNING');
    assert.match(providerAttention.headline, /security-reviewer/);

    insertProviderState(data.file, {
      eventHash: 'provider-recovered',
      type: 'provider.health.checked',
      timestamp: '2026-09-19T21:22:20.000Z',
      providerId: 'claude-cli',
      available: true,
      circuitState: 'CLOSED',
    });
    insertModelCall(data.file, {
      eventHash: 'preferred-return-call',
      timestamp: '2026-09-19T21:22:30.000Z',
      logicalRole: 'security-reviewer',
      bindingId: 'security-opus',
      providerId: 'claude-cli',
      modelId: 'opus-5',
    });

    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });
    binding = home.roleBindings.find((item) => item.logicalRole === 'security-reviewer');

    assert.equal(home.system.providers, 'HEALTHY');
    assert.equal(binding?.state, 'ACTIVE');
    assert.equal(binding?.activeBindingId, 'security-opus');
    assert.equal(binding?.failureKind, undefined);
    assert.equal(binding?.nextCheckAt, undefined);
    assert.ok(
      !home.attention.items.some(
        (item) => item.kind === 'QUOTA_WAIT' || item.kind === 'PROVIDER_FALLBACK',
      ),
    );
  } finally {
    await data.cleanup();
  }
});

test('Core Home aggregates active structured errors and budget attention without historical noise', async () => {
  const data = await fixture();
  try {
    insertCurrentWorkFixture(data.file, {
      runId: 'run-runtime',
      timestamp: '2026-09-19T21:30:00.000Z',
      eventType: 'node.started',
      nodeId: 'implementation-agent',
      nodeType: 'MODEL',
      workflowId: 'feature-implementation',
    });

    insertRuntimeErrorEvent(data.file, {
      eventHash: 'runtime-error-old',
      timestamp: '2026-09-19T21:30:10.000Z',
      runId: 'run-runtime',
      severity: 'CRITICAL',
      correlationId: 'corr-runtime-1',
      headline: 'Preferred provider quota exhausted',
    });
    insertRuntimeErrorEvent(data.file, {
      eventHash: 'runtime-error-new',
      timestamp: '2026-09-19T21:30:20.000Z',
      runId: 'run-runtime',
      severity: 'CRITICAL',
      correlationId: 'corr-runtime-1',
      headline: 'Preferred provider remains quota exhausted',
      retryAt: '2026-09-19T21:35:00.000Z',
    });

    insertRuntimeErrorEvent(data.file, {
      eventHash: 'historical-completed-error',
      timestamp: '2026-09-19T21:30:30.000Z',
      runId: 'run-1',
      severity: 'ERROR',
      correlationId: 'corr-completed-run',
      headline: 'Completed run historical error',
    });

    insertBudgetEvent(data.file, {
      eventHash: 'budget-warning',
      type: 'budget.warning',
      timestamp: '2026-09-19T21:30:40.000Z',
      runId: 'run-runtime',
      scope: 'run-budget',
      action: 'Review current budget consumption.',
    });
    insertBudgetEvent(data.file, {
      eventHash: 'budget-exhausted',
      type: 'budget.exhausted',
      timestamp: '2026-09-19T21:30:50.000Z',
      runId: 'run-runtime',
      scope: 'run-budget',
      action: 'Increase or reallocate the run budget.',
    });

    const model = new DashboardReadModel(data.file);
    const home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });

    assert.equal(home.system.state, 'ATTENTION');
    assert.equal(home.system.criticalErrorCount, 1);
    assert.ok(!home.sourceFreshness.staleSources.includes('runtime-attention'));

    const runtimeItems = home.attention.items.filter((item) => item.kind === 'RUNTIME_ERROR');
    assert.equal(runtimeItems.length, 1);
    assert.equal(runtimeItems[0]?.correlationId, 'corr-runtime-1');
    assert.equal(runtimeItems[0]?.headline, 'Preferred provider remains quota exhausted');
    assert.equal(runtimeItems[0]?.severity, 'CRITICAL');
    assert.equal(runtimeItems[0]?.runId, 'run-runtime');
    assert.ok(!home.attention.items.some((item) => item.correlationId === 'corr-completed-run'));

    const budgetItems = home.attention.items.filter((item) => item.kind === 'BUDGET_WARNING');
    assert.equal(budgetItems.length, 1);
    assert.equal(budgetItems[0]?.severity, 'ERROR');
    assert.equal(budgetItems[0]?.headline, 'Budget exhausted');
    assert.equal(budgetItems[0]?.nextAction, 'Increase or reallocate the run budget.');

    assert.equal(home.attention.critical, 1);
    assert.equal(home.attention.errors, 1);
    assert.equal(home.attention.warnings, 0);
    assert.equal(home.attention.total, 2);
  } finally {
    await data.cleanup();
  }
});

test('Core Home continuity is revision-aware and clears stale checkpoint attention', async () => {
  const data = await fixture();
  try {
    insertCheckpointEvent(data.file, {
      eventHash: 'checkpoint-stale',
      timestamp: '2026-09-19T21:40:00.000Z',
      sourceRevision: 'old-head',
      resumeReady: true,
    });

    const model = new DashboardReadModel(data.file);
    let home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });

    assert.equal(home.continuity.state, 'ATTENTION');
    assert.equal(home.continuity.latestCheckpointAt, '2026-09-19T21:40:00.000Z');
    assert.equal(home.continuity.sourceRevision, 'old-head');
    assert.equal(home.system.continuity, 'ATTENTION');
    assert.equal(home.sourceFreshness.continuityUpdatedAt, '2026-09-19T21:40:00.000Z');
    assert.ok(!home.sourceFreshness.staleSources.includes('continuity'));
    assert.ok(home.attention.items.some((item) => item.kind === 'CONTINUITY_RISK'));

    insertCheckpointEvent(data.file, {
      eventHash: 'checkpoint-current',
      timestamp: '2026-09-19T21:41:00.000Z',
      sourceRevision: 'head',
      resumeReady: true,
    });

    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });

    assert.equal(home.continuity.state, 'HEALTHY');
    assert.equal(home.continuity.resumeReady, true);
    assert.equal(home.continuity.sourceRevision, 'head');
    assert.equal(home.system.continuity, 'HEALTHY');
    assert.ok(!home.attention.items.some((item) => item.kind === 'CONTINUITY_RISK'));
  } finally {
    await data.cleanup();
  }
});

test('Core Home security findings are current-revision bound and remediation-aware', async () => {
  const data = await fixture();
  try {
    insertFindingEvent(data.file, {
      eventHash: 'finding-old-revision',
      timestamp: '2026-09-19T21:45:00.000Z',
      revision: 'old-head',
      findingId: 'finding-old',
      severity: 'CRITICAL',
      state: 'OPEN',
    });
    insertFindingEvent(data.file, {
      eventHash: 'finding-critical-open',
      timestamp: '2026-09-19T21:46:00.000Z',
      revision: 'head',
      findingId: 'finding-critical',
      severity: 'CRITICAL',
      state: 'OPEN',
    });
    insertFindingEvent(data.file, {
      eventHash: 'finding-medium-open',
      timestamp: '2026-09-19T21:47:00.000Z',
      revision: 'head',
      findingId: 'finding-medium',
      severity: 'MEDIUM',
      state: 'OPEN',
    });

    const model = new DashboardReadModel(data.file);
    let home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });

    assert.equal(home.findings.state, 'ATTENTION');
    assert.equal(home.findings.critical, 1);
    assert.equal(home.findings.high, 0);
    assert.equal(home.findings.unresolved, 2);
    assert.equal(home.findings.latestFindingAt, '2026-09-19T21:47:00.000Z');
    assert.ok(!home.sourceFreshness.staleSources.includes('findings'));
    const securityAttention = home.attention.items.find((item) => item.kind === 'SECURITY_FINDING');
    assert.ok(securityAttention);
    assert.equal(securityAttention.severity, 'CRITICAL');
    assert.equal(home.system.criticalErrorCount, 0);

    insertFindingEvent(data.file, {
      eventHash: 'finding-critical-remediated',
      timestamp: '2026-09-19T21:48:00.000Z',
      revision: 'head',
      findingId: 'finding-critical',
      severity: 'CRITICAL',
      state: 'REMEDIATED',
    });

    home = model.homeSnapshot({ now: '2026-09-19T23:00:00.000Z' });

    assert.equal(home.findings.state, 'DEGRADED');
    assert.equal(home.findings.critical, 0);
    assert.equal(home.findings.high, 0);
    assert.equal(home.findings.unresolved, 1);
    assert.ok(!home.attention.items.some((item) => item.kind === 'SECURITY_FINDING'));
    assert.equal(home.system.criticalErrorCount, 0);
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
    assert.match(homeHtml, /Continuity/);
    assert.match(homeHtml, /id="continuity"/);
    assert.match(homeHtml, /Security/);
    assert.match(homeHtml, /id="security-findings"/);
    assert.match(homeHtml, /Source Control \/ CI/);
    assert.match(homeHtml, /id="external-status"/);
    assert.match(homeHtml, /\/api\/external-status/);
    assert.match(homeHtml, /role-bindings/);
    assert.match(homeHtml, /<details class="advanced-details">/);
    assert.match(homeHtml, /<summary>Engineering details<\/summary>/);
    assert.match(homeHtml, /aria-live="polite"/);
    assert.match(homeHtml, /tabindex="0"/);
    assert.match(homeHtml, /visibilitychange/);
    assert.match(homeHtml, /document\.hidden \? 60000 : 15000/);
    assert.match(homeHtml, /\/api\/home/);
    assert.equal(home.headers.get('x-freehighlander-mode'), 'read-only');
    assert.match(homeHtml, /href="\/modules\/fh-kuika"/);

    const blueprintCatalog = await fetch(`${base}/modules/fh-kuika/build/blueprints`);
    assert.equal(blueprintCatalog.status, 200);
    const blueprintCatalogHtml = await blueprintCatalog.text();
    assert.match(blueprintCatalogHtml, /Blueprints/);
    assert.match(blueprintCatalogHtml, /Feature Implementation/);

    const blueprintDetail = await fetch(
      `${base}/modules/fh-kuika/build/blueprints/security-patch`,
    );
    assert.equal(blueprintDetail.status, 200);
    assert.match(await blueprintDetail.text(), /security-reviewer/);

    const missingBlueprint = await fetch(
      `${base}/modules/fh-kuika/build/blueprints/not-present`,
    );
    assert.equal(missingBlueprint.status, 404);
    assert.match(await missingBlueprint.text(), /Blueprint not found/);

    const kuika = await fetch(`${base}/modules/fh-kuika`);
    assert.equal(kuika.status, 200);
    const kuikaHtml = await kuika.text();
    assert.match(kuikaHtml, /<h1>FH-KUIKA<\/h1>/);
    assert.match(kuikaHtml, /Optional productization module/);
    assert.match(kuikaHtml, /\/api\/home/);
    assert.match(kuikaHtml, /Core runtime remains valid and usable/);
    assert.match(kuikaHtml, /href="\/modules\/fh-kuika\/workbench"/);
    assert.match(kuikaHtml, /href="\/modules\/fh-kuika\/build"/);
    assert.match(kuikaHtml, /href="\/modules\/fh-kuika\/integrate"/);
    assert.match(kuikaHtml, /href="\/modules\/fh-kuika\/knowledge"/);

    const workbench = await fetch(`${base}/modules/fh-kuika/workbench`);
    assert.equal(workbench.status, 200);
    const workbenchHtml = await workbench.text();
    assert.match(workbenchHtml, /AI Workbench/);
    assert.match(workbenchHtml, /data-mode="ASK"/);
    assert.match(workbenchHtml, /data-mode="EXECUTE"/);
    assert.match(workbenchHtml, /NO MODEL CALL ON SELECT/);
    assert.match(workbenchHtml, /\/api\/home/);
    assert.equal(workbench.headers.get('x-freehighlander-mode'), 'read-only');
    assert.match(kuikaHtml, /href="\/modules\/fh-kuika\/operate"/);
    assert.equal(kuika.headers.get('x-freehighlander-mode'), 'read-only');

    for (const area of ['build', 'integrate', 'knowledge']) {
      const areaResponse = await fetch(`${base}/modules/fh-kuika/${area}`);
      assert.equal(areaResponse.status, 200);
      assert.equal(areaResponse.headers.get('x-freehighlander-mode'), 'read-only');
      const areaHtml = await areaResponse.text();
      assert.match(areaHtml, /FH-KUIKA/);
      assert.match(areaHtml, /aria-label="FH-KUIKA areas"/);
      assert.match(areaHtml, /invokes no model/);
    }

    const operate = await fetch(`${base}/modules/fh-kuika/operate`);
    assert.equal(operate.status, 200);
    const operateHtml = await operate.text();
    assert.match(operateHtml, /Explainable Operations/);
    assert.match(operateHtml, /\/api\/home/);
    assert.match(operateHtml, /\/api\/runs\?limit=20/);
    assert.match(operateHtml, /structured runtime errors/);
    assert.equal(operate.headers.get('x-freehighlander-mode'), 'read-only');

    const operateSnapshot = await (
      await fetch(`${base}/api/modules/fh-kuika/operate?limit=20`)
    ).json();
    assert.equal(operateSnapshot.schemaVersion, 1);
    assert.equal(operateSnapshot.projectionAuthority, 'NONE');
    assert.ok(Array.isArray(operateSnapshot.errors));
    assert.ok(Array.isArray(operateSnapshot.routing));

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.mode, 'read-only');
    assert.equal(health.schemaVersion, 1);

    const homeSnapshot = await (await fetch(`${base}/api/home`)).json();
    assert.equal(homeSnapshot.schemaVersion, 1);
    assert.equal(homeSnapshot.projectionAuthority, 'NONE');
    assert.equal(homeSnapshot.project.repository, 'skonyd/freehighlander-engineering-platform');
    assert.equal(homeSnapshot.economy.mode, 'TOKEN_ECONOMY');
    assert.equal(homeSnapshot.economy.authority, 'NONE');

    const externalStatus = await (await fetch(`${base}/api/external-status`)).json();
    assert.equal(externalStatus.schemaVersion, 1);
    assert.equal(externalStatus.state, 'DISABLED');
    assert.equal(externalStatus.authority, 'NONE');
    assert.equal(externalStatus.repository, 'skonyd/freehighlander-engineering-platform');
    assert.equal(externalStatus.exactRevision, 'head');

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

    const externalStatus = await (await fetch(`${base}/api/external-status`)).json();
    assert.equal(externalStatus.state, 'DISABLED');
    assert.equal(externalStatus.repository, null);

    const home = await fetch(`${base}/api/home`);
    assert.equal(home.status, 503);
    assert.equal((await home.json()).error, 'database_not_ready');

    const operateSnapshot = await fetch(`${base}/api/modules/fh-kuika/operate`);
    assert.equal(operateSnapshot.status, 503);
    assert.equal((await operateSnapshot.json()).error, 'database_not_ready');

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
