import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  FH_KUIKA_KNOWLEDGE_HTML,
  buildFhKuikaKnowledgeAnswerPackageV1,
  createFhKuikaDashboardKnowledgeSourceV1,
  createDashboardServer,
  createFhKuikaKnowledgeQueryV1,
  dashboardKnowledgeSourceCanGrantAuthority,
  dashboardKnowledgeSourceCanInventLineage,
  dashboardKnowledgeSourceCanInvokeModel,
  knowledgeAnswerPackageCanGrantAuthority,
  knowledgeAnswerPackageCanInvokeModel,
  knowledgePageCanGrantAuthority,
  knowledgePageCanInvokeModel,
  knowledgePageCanMutateDomain,
  retrieveFhKuikaKnowledgeV1,
} from '../dist/index.js';

const revision = 'a'.repeat(40);

function sourceFixture() {
  return {
    listRuns: () => [
      {
        runId: 'run-1',
        taskId: 'task-1',
        firstTimestamp: '2026-09-28T00:00:00.000Z',
        lastTimestamp: '2026-09-28T00:05:00.000Z',
        status: 'PASSED',
        repository: 'skonyd/freehighlander-engineering-platform',
        pullRequest: 1,
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
        state: 'current',
      },
    ],
  };
}

test('dashboard knowledge source exposes exact artifact and revision provenance without invention', () => {
  const source = createFhKuikaDashboardKnowledgeSourceV1(sourceFixture());

  const artifact = source.exactEntity('artifact-1')[0];
  assert.equal(artifact?.resultClass, 'AUTHORITATIVE');
  assert.equal(artifact?.provenance.sourceKind, 'ARTIFACT');
  assert.equal(artifact?.provenance.revision?.sha, revision);

  const exactRevision = source.exactRevision(
    'skonyd/freehighlander-engineering-platform',
    revision,
  );
  assert.equal(exactRevision.length, 1);
  assert.equal(exactRevision[0]?.provenance.revision?.sha, revision);

  assert.deepEqual(source.traverseAuthoritative('artifact-1', 1, 4), []);
  assert.equal(dashboardKnowledgeSourceCanInvokeModel(), false);
  assert.equal(dashboardKnowledgeSourceCanGrantAuthority(), false);
  assert.equal(dashboardKnowledgeSourceCanInventLineage(), false);
});

test('knowledge answer package preserves authoritative/discovery separation and provenance state', () => {
  const query = createFhKuikaKnowledgeQueryV1({
    text: 'artifact-1',
    entityId: 'artifact-1',
  });
  const retrieval = retrieveFhKuikaKnowledgeV1(
    createFhKuikaDashboardKnowledgeSourceV1(sourceFixture()),
    query,
  );
  const answer = buildFhKuikaKnowledgeAnswerPackageV1(retrieval);

  assert.equal(answer.authoritativeCount, 2);
  assert.equal(answer.discoveryCount, 0);
  assert.equal(answer.provenanceComplete, true);
  assert.equal(answer.authority, 'NONE');
  assert.equal(answer.modelInvocationRequired, false);
  assert.equal(knowledgeAnswerPackageCanGrantAuthority(), false);
  assert.equal(knowledgeAnswerPackageCanInvokeModel(), false);
});

test('Knowledge Explorer stays inside Knowledge surface and exposes no authority or model action', () => {
  assert.match(FH_KUIKA_KNOWLEDGE_HTML, /Engineering Knowledge/);
  assert.match(FH_KUIKA_KNOWLEDGE_HTML, /Search/);
  assert.match(FH_KUIKA_KNOWLEDGE_HTML, /Graph/);
  assert.match(FH_KUIKA_KNOWLEDGE_HTML, /Evidence/);
  assert.match(FH_KUIKA_KNOWLEDGE_HTML, /model calls 0/);
  assert.doesNotMatch(FH_KUIKA_KNOWLEDGE_HTML, /id="approve"/);
  assert.equal(knowledgePageCanInvokeModel(), false);
  assert.equal(knowledgePageCanGrantAuthority(), false);
  assert.equal(knowledgePageCanMutateDomain(), false);
});

test('knowledge eval keeps semantic discovery below authoritative retrieval', () => {
  const authoritative = {
    id: 'entity-1',
    label: 'REQ-1',
    resultClass: 'AUTHORITATIVE',
    provenance: {
      sourceKind: 'LINEAGE_ENTITY',
      sourceId: 'REQ-1@1',
      evidenceIds: [],
    },
    authority: 'NONE',
  };
  const semantic = {
    id: 'semantic-1',
    label: 'similar',
    resultClass: 'DISCOVERY',
    provenance: {
      sourceKind: 'SEMANTIC_DISCOVERY',
      sourceId: 'semantic-1',
      evidenceIds: [],
    },
    semanticScore: 0.99,
    authority: 'NONE',
  };

  const query = createFhKuikaKnowledgeQueryV1({
    text: 'REQ-1',
    entityId: 'REQ-1',
    includeSemanticDiscovery: true,
  });
  const retrieval = retrieveFhKuikaKnowledgeV1(
    {
      exactEntity: () => [authoritative],
      exactRevision: () => [],
      traverseAuthoritative: () => [],
      evidenceForResults: () => [],
      semanticDiscover: () => [semantic],
    },
    query,
  );

  assert.equal(retrieval.results[0]?.resultClass, 'AUTHORITATIVE');
  assert.equal(retrieval.results.at(-1)?.resultClass, 'DISCOVERY');
});

test('Knowledge Explorer HTTP query returns provenance-bearing exact artifact results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fh-kuika-knowledge-'));
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
  db.prepare(
    `INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
    'current',
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

    const page = await fetch(base + '/modules/fh-kuika/knowledge');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Engineering Knowledge/);

    const response = await fetch(
      base + '/api/modules/fh-kuika/knowledge/query?text=artifact-1&mode=EXACT_ENTITY&entityId=artifact-1',
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.authority, 'NONE');
    assert.equal(body.modelInvocationRequired, false);
    assert.equal(body.authoritativeCount, 2);
    assert.equal(body.results[0].provenance.sourceKind, 'ARTIFACT');

    const invalid = await fetch(
      base + '/api/modules/fh-kuika/knowledge/query?text=x&mode=INVALID',
    );
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
