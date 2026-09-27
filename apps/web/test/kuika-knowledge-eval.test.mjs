import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaKnowledgeQueryV1,
  evaluateFhKuikaKnowledgeRetrievalV1,
  knowledgeEvalCanGrantAuthority,
  knowledgeEvalRequiresModelCall,
} from '../dist/index.js';

test('knowledge retrieval eval measures recall, provenance and semantic isolation deterministically', () => {
  const query = createFhKuikaKnowledgeQueryV1({ text: 'req-1' });
  const retrieval = {
    schemaVersion: 1,
    query,
    results: [
      {
        id: 'rel-1',
        label: 'relation',
        resultClass: 'AUTHORITATIVE',
        provenance: {
          sourceKind: 'LINEAGE_RELATION',
          sourceId: 'rel-1',
          evidenceIds: ['ev-1'],
        },
        authority: 'NONE',
      },
      {
        id: 'semantic:1',
        label: 'similar',
        resultClass: 'DISCOVERY',
        provenance: {
          sourceKind: 'SEMANTIC_DISCOVERY',
          sourceId: 'doc-1',
          evidenceIds: [],
        },
        semanticScore: 0.8,
        authority: 'NONE',
      },
    ],
    trace: [
      { stage: 'EXACT_LOOKUP', executed: true, resultCount: 1 },
      { stage: 'LINEAGE_TRAVERSAL', executed: true, resultCount: 1 },
      { stage: 'EVIDENCE_RETRIEVAL', executed: true, resultCount: 1 },
      { stage: 'SEMANTIC_DISCOVERY', executed: true, resultCount: 1 },
    ],
    projectionAuthority: 'NONE',
    semanticDiscoveryAuthority: 'FORBIDDEN',
  };

  const report = evaluateFhKuikaKnowledgeRetrievalV1(retrieval, {
    requiredAuthoritativeIds: ['rel-1'],
    requiredStages: ['EXACT_LOOKUP', 'LINEAGE_TRAVERSAL', 'EVIDENCE_RETRIEVAL'],
    requireCompleteProvenance: true,
  });

  assert.equal(report.passed, true);
  assert.equal(report.authoritativeRecall, 1);
  assert.equal(report.provenanceComplete, true);
  assert.equal(report.semanticIsolationPreserved, true);
  assert.equal(report.authority, 'NONE');
  assert.equal(report.modelInvocationRequired, false);
  assert.equal(knowledgeEvalCanGrantAuthority(), false);
  assert.equal(knowledgeEvalRequiresModelCall(), false);
});

test('knowledge retrieval eval fails closed on missing authoritative evidence', () => {
  const query = createFhKuikaKnowledgeQueryV1({ text: 'req-1' });
  const report = evaluateFhKuikaKnowledgeRetrievalV1(
    {
      schemaVersion: 1,
      query,
      results: [],
      trace: [],
      projectionAuthority: 'NONE',
      semanticDiscoveryAuthority: 'FORBIDDEN',
    },
    {
      requiredAuthoritativeIds: ['rel-1'],
      requiredStages: ['LINEAGE_TRAVERSAL'],
      requireCompleteProvenance: true,
    },
  );

  assert.equal(report.passed, false);
  assert.deepEqual(report.missingAuthoritativeIds, ['rel-1']);
  assert.deepEqual(report.missingStages, ['LINEAGE_TRAVERSAL']);
  assert.equal(report.authoritativeRecall, 0);
});
