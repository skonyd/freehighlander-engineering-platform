import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  createDashboardServer,
  createFhKuikaDashboardKnowledgeSourceV1,
  dashboardKnowledgeSourceCanGrantAuthority,
  dashboardKnowledgeSourceCanInventLineage,
  dashboardKnowledgeSourceCanInvokeModel,
} from '../dist/index.js';

const revision = 'a'.repeat(40);

function readSourceFixture() {
  return {
    listRuns: () => [
      {
        runId: 'run-1',
        taskId: 'task-1',
        firstTimestamp: '2026-09-28T00:00:00.000Z',
        lastTimestamp: '2026-09-28T00:05:00.000Z',
        status: 'PASSED',
        repository: 'skonyd/freehighlander-engineering-platform',
        pullRequest: 400,
        branch: 'main',
        headSha: revision,
        workflowId: 'review',
        workflowVersion: '1.0.0',
        humanRequired: false,
        eventCount: 1,
        modelCallCount: 0,
      },
    ],
    listArtifacts: () => [
      {
        artifactId: 'artifact-1',
        firstSeenTimestamp: '2026-09-28T00:01:00.000Z',
        lastSeenTimestamp: '2026-09-28T00:02:00.000Z',
        state: 'CREATED',
      },
    ],
  };
}

test('dashboard Knowledge source exposes recorded artifact/revision provenance without invented lineage', () => {
  const source = createFhKuikaDashboardKnowledgeSourceV1(readSourceFixture());

  const artifact = source.exactEntity('artifact-1')[0];
  assert.equal(artifact?.resultClass, 'AUTHORITATIVE');
  assert.equal(artifact?.provenance.sourceKind, 'ARTIFACT');
  assert.equal(artifact?.provenance.revision?.sha, revision);

  const revisionResults = source.exactRevision(
    'skonyd/freehighlander-engineering-platform',
    revision,
  );
  assert.equal(revisionResults.length, 1);
  assert.equal(revisionResults[0]?.provenance.revision?.sha, revision);

  assert.deepEqual(source.traverseAuthoritative('artifact-1', undefined, 4), []);
  assert.equal(dashboardKnowledgeSourceCanInvokeModel(), false);
  assert.equal(dashboardKnowledgeSourceCanGrantAuthority(), false);
  assert.equal(dashboardKnowledgeSourceCanInventLineage(), false);
});

test('Knowledge query automatically uses dashboard telemetry when the database exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fh-kuika-knowledge-dashboard-'));
  const file = path.join(root, 'telemetry.sqlite');
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (1, '2026-09-28T00:00:00.000Z');

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
    'run-knowledge',
    'task-knowledge',
    '2026-09-28T00:00:00.000Z',
    '2026-09-28T00:01:00.000Z',
    'PASSED',
    'skonyd/freehighlander-engineering-platform',
    null,
    'main',
    'b'.repeat(40),
    revision,
    'review',
    '1.0.0',
    'workflow-hash',
    0,
    1,
    0,
    'run.completed',
  );
  db.prepare(`INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?)`).run(
    'artifact-1',
    'run-knowledge',
    '2026-09-28T00:00:10.000Z',
    '2026-09-28T00:00:20.000Z',
    'CREATED',
    'event-artifact',
  );
  db.close();

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
    const base = 'http://127.0.0.1:' + address.port;

    const response = await fetch(
      base +
        '/api/modules/fh-kuika/knowledge/query?text=artifact-1&mode=EXACT_ENTITY&entityId=artifact-1',
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.sourceAvailable, true);
    assert.equal(payload.authority, 'NONE');
    assert.equal(payload.retrieval.results[0]?.provenance.sourceKind, 'ARTIFACT');
    assert.equal(payload.retrieval.results[0]?.provenance.revision.sha, revision);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
