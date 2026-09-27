import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaKnowledgeAnswerPackageV1,
  evaluateFhKuikaKnowledgeRetrievalV1,
  knowledgeAnswerPackageCanGenerateUngroundedClaims,
  knowledgeAnswerPackageCanGrantAuthority,
  knowledgeAnswerPackageCanInvokeModel,
  knowledgeEvalSuiteCanGrantAuthority,
  knowledgeEvalSuiteCanInvokeModel,
  knowledgeEvalSuiteCanPromoteSemanticResults,
} from '../dist/index.js';

function query() {
  return {
    schemaVersion: 1,
    text: 'req-1',
    mode: 'HYBRID',
    entityId: 'req-1',
    maxDepth: 4,
    includeSemanticDiscovery: true,
    resultLimit: 10,
    authority: 'NONE',
  };
}

function retrieval() {
  return {
    schemaVersion: 1,
    query: query(),
    results: [
      {
        id: 'req-1',
        label: 'Requirement req-1',
        resultClass: 'AUTHORITATIVE',
        provenance: {
          sourceKind: 'LINEAGE_ENTITY',
          sourceId: 'req-1',
          sourceDigest: 'a'.repeat(64),
          revision: {
            repository: 'skonyd/freehighlander-engineering-platform',
            sha: 'b'.repeat(40),
          },
          evidenceIds: ['ev-1'],
        },
        authority: 'NONE',
      },
      {
        id: 'semantic:doc-1',
        label: 'Similar design note',
        resultClass: 'DISCOVERY',
        provenance: {
          sourceKind: 'SEMANTIC_DISCOVERY',
          sourceId: 'doc-1',
          sourceDigest: 'c'.repeat(64),
          evidenceIds: [],
        },
        semanticScore: 0.91,
        authority: 'NONE',
      },
    ],
    trace: [
      { stage: 'EXACT_LOOKUP', executed: true, resultCount: 1 },
      { stage: 'LINEAGE_TRAVERSAL', executed: true, resultCount: 0 },
      { stage: 'EVIDENCE_RETRIEVAL', executed: true, resultCount: 0 },
      { stage: 'SEMANTIC_DISCOVERY', executed: true, resultCount: 1 },
    ],
    projectionAuthority: 'NONE',
    semanticDiscoveryAuthority: 'FORBIDDEN',
  };
}

test('knowledge answer package preserves authoritative/discovery separation and provenance', () => {
  const answer = buildFhKuikaKnowledgeAnswerPackageV1(retrieval());

  assert.equal(answer.authoritativeResults.length, 1);
  assert.equal(answer.discoveryResults.length, 1);
  assert.equal(answer.resultCount, 2);
  assert.equal(answer.revisionBoundResultCount, 1);
  assert.equal(answer.evidenceBoundResultCount, 1);
  assert.deepEqual(answer.incompleteProvenanceResultIds, []);
  assert.equal(answer.modelInvocationPerformed, false);
  assert.equal(answer.naturalLanguageAnswerGenerated, false);
  assert.equal(answer.semanticResultsCanEstablishAuthority, false);
  assert.equal(answer.authority, 'NONE');

  assert.equal(knowledgeAnswerPackageCanInvokeModel(), false);
  assert.equal(knowledgeAnswerPackageCanGenerateUngroundedClaims(), false);
  assert.equal(knowledgeAnswerPackageCanGrantAuthority(), false);
});

test('knowledge eval suite checks expected authoritative results deterministically', () => {
  const report = evaluateFhKuikaKnowledgeRetrievalV1([
    {
      id: 'exact-requirement',
      retrieval: retrieval(),
      expectedAuthoritativeResultIds: ['req-1'],
      forbiddenAuthoritativeResultIds: ['semantic:doc-1'],
    },
  ]);

  assert.equal(report.totalCases, 1);
  assert.equal(report.passedCases, 1);
  assert.equal(report.failedCases, 0);
  assert.equal(report.semanticAuthorityViolationCount, 0);
  assert.equal(report.invalidProvenanceCount, 0);
  assert.equal(report.authority, 'NONE');

  assert.equal(knowledgeEvalSuiteCanInvokeModel(), false);
  assert.equal(knowledgeEvalSuiteCanGrantAuthority(), false);
  assert.equal(knowledgeEvalSuiteCanPromoteSemanticResults(), false);
});

test('knowledge eval suite reports missing expected authoritative results', () => {
  const report = evaluateFhKuikaKnowledgeRetrievalV1([
    {
      id: 'missing-result',
      retrieval: retrieval(),
      expectedAuthoritativeResultIds: ['missing'],
    },
  ]);

  assert.equal(report.failedCases, 1);
  assert.match(report.cases[0].errors.join('\n'), /missing expected authoritative result/);
});

test('knowledge eval suite rejects duplicate case identities', () => {
  assert.throws(
    () =>
      evaluateFhKuikaKnowledgeRetrievalV1([
        { id: 'duplicate', retrieval: retrieval() },
        { id: 'duplicate', retrieval: retrieval() },
      ]),
    /case ids must be unique/,
  );
});
