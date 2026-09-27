import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFhKuikaKnowledgeAnswerPackageV1,
  createFhKuikaKnowledgeQueryV1,
  knowledgeAnswerPackageCanGrantAuthority,
  knowledgeAnswerPackageCanPromoteDiscovery,
  knowledgeAnswerPackageRequiresModelCall,
} from '../dist/index.js';

test('knowledge answer package separates authoritative and discovery provenance', () => {
  const query = createFhKuikaKnowledgeQueryV1({ text: 'architecture' });
  const answer = buildFhKuikaKnowledgeAnswerPackageV1({
    schemaVersion: 1,
    query,
    results: [
      {
        id: 'rel-1',
        label: 'REQ-1 implemented by TASK-1',
        resultClass: 'AUTHORITATIVE',
        relationType: 'implemented_by',
        provenance: {
          sourceKind: 'LINEAGE_RELATION',
          sourceId: 'rel-1',
          evidenceIds: ['ev-1'],
        },
        authority: 'NONE',
      },
      {
        id: 'semantic:doc-1',
        label: 'Similar architecture note',
        resultClass: 'DISCOVERY',
        provenance: {
          sourceKind: 'SEMANTIC_DISCOVERY',
          sourceId: 'doc-1',
          evidenceIds: [],
        },
        semanticScore: 0.91,
        authority: 'NONE',
      },
    ],
    trace: [],
    projectionAuthority: 'NONE',
    semanticDiscoveryAuthority: 'FORBIDDEN',
  });

  assert.equal(answer.authoritativeCount, 1);
  assert.equal(answer.discoveryCount, 1);
  assert.equal(answer.provenanceComplete, true);
  assert.equal(answer.discovery[0].semanticScore, 0.91);
  assert.equal(answer.naturalLanguageGenerated, false);
  assert.equal(answer.modelInvocationRequired, false);
  assert.equal(answer.authority, 'NONE');
  assert.equal(knowledgeAnswerPackageCanGrantAuthority(), false);
  assert.equal(knowledgeAnswerPackageCanPromoteDiscovery(), false);
  assert.equal(knowledgeAnswerPackageRequiresModelCall(), false);
});
