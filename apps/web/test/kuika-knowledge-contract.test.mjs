import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaKnowledgeRetrievalPlanV1,
  createFhKuikaKnowledgeQueryV1,
  knowledgeQueryCanGrantAuthority,
  knowledgeRetrievalCanMutateDomain,
  knowledgeRetrievalRequiresModelCall,
  semanticDiscoveryCanEstablishAuthoritativeLineage,
  validateFhKuikaKnowledgeResultV1,
} from '../dist/index.js';

test('FH-KUIKA knowledge query is bounded, deterministic and authority-neutral', () => {
  const query = createFhKuikaKnowledgeQueryV1({
    text: 'trace requirement REQ-12 to release',
    entityId: 'REQ-12',
    entityVersion: 1,
    maxDepth: 6,
    includeSemanticDiscovery: true,
  });

  const plan = buildFhKuikaKnowledgeRetrievalPlanV1(query);

  assert.equal(plan.projectionAuthority, 'NONE');
  assert.equal(plan.semanticDiscoveryAuthority, 'FORBIDDEN');
  assert.deepEqual(plan.orderedStages, [
    'EXACT_LOOKUP',
    'LINEAGE_TRAVERSAL',
    'EVIDENCE_RETRIEVAL',
    'SEMANTIC_DISCOVERY',
  ]);
  assert.equal(knowledgeQueryCanGrantAuthority(), false);
  assert.equal(knowledgeRetrievalCanMutateDomain(), false);
  assert.equal(knowledgeRetrievalRequiresModelCall(), false);
  assert.equal(semanticDiscoveryCanEstablishAuthoritativeLineage(), false);
});

test('FH-KUIKA knowledge query fails closed on invalid exact bindings and bounds', () => {
  assert.throws(
    () => createFhKuikaKnowledgeQueryV1({ text: 'x', mode: 'EXACT_ENTITY' }),
    /EXACT_ENTITY requires entityId/,
  );
  assert.throws(
    () => createFhKuikaKnowledgeQueryV1({ text: 'x', mode: 'EXACT_REVISION' }),
    /EXACT_REVISION requires revision/,
  );
  assert.throws(() => createFhKuikaKnowledgeQueryV1({ text: 'x', maxDepth: 11 }), /maxDepth/);
  assert.throws(
    () => createFhKuikaKnowledgeQueryV1({ text: 'x', resultLimit: 101 }),
    /resultLimit/,
  );
});

test('semantic discovery can never masquerade as authoritative lineage', () => {
  assert.throws(
    () =>
      validateFhKuikaKnowledgeResultV1({
        id: 'semantic-1',
        label: 'similar incident',
        resultClass: 'AUTHORITATIVE',
        provenance: {
          sourceKind: 'SEMANTIC_DISCOVERY',
          sourceId: 'semantic-1',
          evidenceIds: [],
        },
        authority: 'NONE',
      }),
    /semantic discovery result must remain DISCOVERY/,
  );

  validateFhKuikaKnowledgeResultV1({
    id: 'semantic-2',
    label: 'similar incident',
    resultClass: 'DISCOVERY',
    provenance: {
      sourceKind: 'SEMANTIC_DISCOVERY',
      sourceId: 'semantic-2',
      evidenceIds: [],
    },
    semanticScore: 0.82,
    authority: 'NONE',
  });
});

test('authoritative lineage relations require evidence provenance', () => {
  assert.throws(
    () =>
      validateFhKuikaKnowledgeResultV1({
        id: 'relation-1',
        label: 'implemented by',
        resultClass: 'AUTHORITATIVE',
        relationType: 'IMPLEMENTED_BY',
        provenance: {
          sourceKind: 'LINEAGE_RELATION',
          sourceId: 'rel-1',
          sourceDigest: 'a'.repeat(64),
          evidenceIds: [],
        },
        authority: 'NONE',
      }),
    /requires evidence/,
  );

  validateFhKuikaKnowledgeResultV1({
    id: 'relation-2',
    label: 'implemented by',
    resultClass: 'AUTHORITATIVE',
    relationType: 'IMPLEMENTED_BY',
    provenance: {
      sourceKind: 'LINEAGE_RELATION',
      sourceId: 'rel-2',
      sourceDigest: 'b'.repeat(64),
      revision: {
        repository: 'skonyd/freehighlander-engineering-platform',
        sha: 'c'.repeat(40),
      },
      evidenceIds: ['evidence-1'],
    },
    authority: 'NONE',
  });
});
