import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_KNOWLEDGE_EXPLORER_HTML,
  createDashboardServer,
  knowledgeExplorerPageCanGrantAuthority,
  knowledgeExplorerPageCanInvokeModel,
  knowledgeExplorerPageCanMutateRuntime,
} from '../dist/index.js';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return 'http://127.0.0.1:' + address.port;
}

async function close(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test('Knowledge Explorer UI is compact, read-only and authority-neutral', () => {
  assert.match(FH_KUIKA_KNOWLEDGE_EXPLORER_HTML, /Knowledge Explorer/);
  assert.match(FH_KUIKA_KNOWLEDGE_EXPLORER_HTML, /Lineage first/);
  assert.match(FH_KUIKA_KNOWLEDGE_EXPLORER_HTML, /DISCOVERY/);
  assert.equal(knowledgeExplorerPageCanInvokeModel(), false);
  assert.equal(knowledgeExplorerPageCanGrantAuthority(), false);
  assert.equal(knowledgeExplorerPageCanMutateRuntime(), false);
});

test('Knowledge Explorer exposes retrieval plan without inventing a missing lineage source', async () => {
  const server = createDashboardServer({
    databasePath: '/tmp/fh-kuika-knowledge-no-db.sqlite',
  });
  const base = await listen(server);

  try {
    const page = await fetch(base + '/modules/fh-kuika/knowledge/explorer');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Knowledge Explorer/);

    const response = await fetch(
      base + '/api/modules/fh-kuika/knowledge/query?text=architecture&mode=HYBRID',
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.sourceAvailable, false);
    assert.equal(payload.authority, 'NONE');
    assert.equal(payload.retrieval, null);
    assert.deepEqual(payload.plan.orderedStages, [
      'EXACT_LOOKUP',
      'LINEAGE_TRAVERSAL',
      'EVIDENCE_RETRIEVAL',
      'SEMANTIC_DISCOVERY',
    ]);
  } finally {
    await close(server);
  }
});

test(
  'Knowledge Explorer renders exact authoritative results only from an injected read source',
  async () => {
  const source = {
    exactEntity: (entityId) => [
      {
        id: 'entity:' + entityId,
        label: 'Requirement ' + entityId,
        resultClass: 'AUTHORITATIVE',
        provenance: {
          sourceKind: 'LINEAGE_ENTITY',
          sourceId: entityId,
          sourceDigest: 'a'.repeat(64),
          evidenceIds: [],
        },
        authority: 'NONE',
      },
    ],
    exactRevision: () => [],
    traverseAuthoritative: () => [],
    evidenceForResults: () => [],
  };

  const server = createDashboardServer({
    databasePath: '/tmp/fh-kuika-knowledge-no-db.sqlite',
    knowledgeSource: source,
  });
  const base = await listen(server);

  try {
    const response = await fetch(
      base +
        '/api/modules/fh-kuika/knowledge/query?text=req-1&mode=EXACT_ENTITY&entityId=req-1',
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.sourceAvailable, true);
    assert.equal(payload.retrieval.projectionAuthority, 'NONE');
    assert.equal(payload.retrieval.results.length, 1);
    assert.equal(payload.retrieval.results[0].resultClass, 'AUTHORITATIVE');
    assert.equal(payload.retrieval.results[0].provenance.sourceId, 'req-1');
  } finally {
    await close(server);
  }
  },
);
