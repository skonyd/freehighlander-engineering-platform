import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_KNOWLEDGE_HTML,
  buildFhKuikaKnowledgeAnswerPackageV1,
  createFhKuikaDashboardKnowledgeSourceV1,
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
