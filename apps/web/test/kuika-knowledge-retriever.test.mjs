import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaKnowledgeQueryV1,
  lineageFirstRetrieverCanGrantAuthority,
  lineageFirstRetrieverCanMutateDomain,
  lineageFirstRetrieverCanPromoteSemanticResult,
  retrieveFhKuikaKnowledgeV1,
} from '../dist/index.js';

const authoritativeEntity = {
  id: 'entity-1',
  label: 'REQ-1',
  resultClass: 'AUTHORITATIVE',
  provenance: {
    sourceKind: 'LINEAGE_ENTITY',
    sourceId: 'REQ-1@1',
    sourceDigest: 'a'.repeat(64),
    evidenceIds: [],
  },
  authority: 'NONE',
};

const authoritativeRelation = {
  id: 'relation-1',
  label: 'implemented by',
  resultClass: 'AUTHORITATIVE',
  relationType: 'IMPLEMENTED_BY',
  provenance: {
    sourceKind: 'LINEAGE_RELATION',
    sourceId: 'rel-1',
    sourceDigest: 'b'.repeat(64),
    evidenceIds: ['evidence-1'],
  },
  authority: 'NONE',
};

const evidence = {
  id: 'evidence-1',
  label: 'trusted implementation evidence',
  resultClass: 'AUTHORITATIVE',
  provenance: {
    sourceKind: 'EVIDENCE',
    sourceId: 'evidence-1',
    sourceDigest: 'c'.repeat(64),
    evidenceIds: ['evidence-1'],
  },
  authority: 'NONE',
};

const semantic = {
  id: 'semantic-1',
  label: 'similar incident',
  resultClass: 'DISCOVERY',
  provenance: {
    sourceKind: 'SEMANTIC_DISCOVERY',
    sourceId: 'semantic-1',
    evidenceIds: [],
  },
  semanticScore: 0.72,
  authority: 'NONE',
};

test('lineage-first retriever preserves exact -> lineage -> evidence -> semantic order', () => {
  const calls = [];
  const source = {
    exactEntity: () => {
      calls.push('exact');
      return [authoritativeEntity];
    },
    exactRevision: () => [],
    traverseAuthoritative: () => {
      calls.push('lineage');
      return [authoritativeRelation];
    },
    evidenceForResults: () => {
      calls.push('evidence');
      return [evidence];
    },
    semanticDiscover: () => {
      calls.push('semantic');
      return [semantic];
    },
  };

  const query = createFhKuikaKnowledgeQueryV1({
    text: 'trace REQ-1',
    entityId: 'REQ-1',
    entityVersion: 1,
    includeSemanticDiscovery: true,
  });

  const result = retrieveFhKuikaKnowledgeV1(source, query);

  assert.deepEqual(calls, ['exact', 'lineage', 'evidence', 'semantic']);
  assert.deepEqual(
    result.trace.map((item) => item.stage),
    ['EXACT_LOOKUP', 'LINEAGE_TRAVERSAL', 'EVIDENCE_RETRIEVAL', 'SEMANTIC_DISCOVERY'],
  );
  assert.equal(result.results.at(-1)?.resultClass, 'DISCOVERY');
  assert.equal(result.projectionAuthority, 'NONE');
  assert.equal(result.semanticDiscoveryAuthority, 'FORBIDDEN');
  assert.equal(lineageFirstRetrieverCanGrantAuthority(), false);
  assert.equal(lineageFirstRetrieverCanMutateDomain(), false);
  assert.equal(lineageFirstRetrieverCanPromoteSemanticResult(), false);
});

test('semantic discovery is skipped unless explicitly enabled', () => {
  let semanticCalls = 0;
  const source = {
    exactEntity: () => [authoritativeEntity],
    exactRevision: () => [],
    traverseAuthoritative: () => [],
    evidenceForResults: () => [],
    semanticDiscover: () => {
      semanticCalls += 1;
      return [semantic];
    },
  };

  const query = createFhKuikaKnowledgeQueryV1({
    text: 'REQ-1',
    entityId: 'REQ-1',
    includeSemanticDiscovery: false,
  });
  const result = retrieveFhKuikaKnowledgeV1(source, query);

  assert.equal(semanticCalls, 0);
  assert.equal(result.trace.at(-1)?.executed, false);
});

test('semantic adapter fails closed if it tries to return authoritative data', () => {
  const source = {
    exactEntity: () => [],
    exactRevision: () => [],
    traverseAuthoritative: () => [],
    evidenceForResults: () => [],
    semanticDiscover: () => [
      {
        ...semantic,
        resultClass: 'AUTHORITATIVE',
      },
    ],
  };

  const query = createFhKuikaKnowledgeQueryV1({
    text: 'find similar',
    includeSemanticDiscovery: true,
  });

  assert.throws(
    () => retrieveFhKuikaKnowledgeV1(source, query),
    /semantic discovery returned non-discovery result/,
  );
});

test('retriever deduplicates repeated authoritative source results before limit', () => {
  const source = {
    exactEntity: () => [authoritativeEntity, authoritativeEntity],
    exactRevision: () => [],
    traverseAuthoritative: () => [authoritativeEntity],
    evidenceForResults: () => [],
  };

  const query = createFhKuikaKnowledgeQueryV1({
    text: 'REQ-1',
    entityId: 'REQ-1',
    resultLimit: 1,
  });

  const result = retrieveFhKuikaKnowledgeV1(source, query);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.id, 'entity-1');
});
