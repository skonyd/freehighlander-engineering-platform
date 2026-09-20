import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLineageSnapshot,
  lineageCanGrantAuthority,
  lineageCanMutateDomain,
  lineageProjection,
  lineageRequiresGraphDatabase,
  semanticSearchCanEstablishLineageAuthority,
  traverseLineage,
  validateLineageGraph,
} from '../dist/index.js';

const digest = (char) => char.repeat(64);
const revision = { repository: 'skonyd/freehighlander-engineering-platform', sha: 'a'.repeat(40) };

const entities = [
  { schemaVersion: 1, id: 'req-1', version: 1, kind: 'REQUIREMENT', label: 'Requirement', digest: digest('1') },
  { schemaVersion: 1, id: 'ac-1', version: 1, kind: 'ACCEPTANCE_CRITERION', label: 'AC', digest: digest('2') },
  { schemaVersion: 1, id: 'code-1', version: 1, kind: 'CODE_REVISION', label: 'Code', digest: digest('3'), revision },
  { schemaVersion: 1, id: 'test-1', version: 1, kind: 'TEST_EVIDENCE', label: 'Test', digest: digest('4') },
];

const trustedEvidence = [{ id: 'ev-1', digest: digest('e'), provenance: 'TRUSTED' }];

const graph = {
  schemaVersion: 1,
  entities,
  relations: [
    {
      schemaVersion: 1,
      id: 'rel-1',
      kind: 'REFINES',
      relationClass: 'AUTHORITATIVE',
      from: { id: 'req-1', version: 1 },
      to: { id: 'ac-1', version: 1 },
      evidence: trustedEvidence,
    },
    {
      schemaVersion: 1,
      id: 'rel-2',
      kind: 'IMPLEMENTED_BY',
      relationClass: 'AUTHORITATIVE',
      from: { id: 'ac-1', version: 1 },
      to: { id: 'code-1', version: 1 },
      evidence: trustedEvidence,
    },
    {
      schemaVersion: 1,
      id: 'rel-3',
      kind: 'VERIFIED_BY',
      relationClass: 'AUTHORITATIVE',
      from: { id: 'ac-1', version: 1 },
      to: { id: 'test-1', version: 1 },
      evidence: trustedEvidence,
    },
  ],
  authority: 'NONE',
  semanticSearchAuthority: 'FORBIDDEN',
  storageModel: 'RELATIONAL_FIRST',
};

test('requirement to implementation/test lineage is deterministic and read-only', async () => {
  const projection = lineageProjection(graph);
  const traversal = traverseLineage(graph, { id: 'req-1', version: 1 }, 3);
  const first = await buildLineageSnapshot(graph);
  const reordered = {
    ...graph,
    entities: [...graph.entities].reverse(),
    relations: [...graph.relations].reverse(),
  };
  const second = await buildLineageSnapshot(reordered);

  assert.equal(projection.authoritativeRelationCount, 3);
  assert.deepEqual(
    traversal.map((item) => item.ref.id),
    ['req-1', 'ac-1', 'code-1', 'test-1'],
  );
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(lineageCanGrantAuthority(), false);
  assert.equal(lineageCanMutateDomain(), false);
  assert.equal(semanticSearchCanEstablishLineageAuthority(), false);
  assert.equal(lineageRequiresGraphDatabase(), false);
});

test('missing exact relation endpoint fails closed', () => {
  const invalid = {
    ...graph,
    relations: [
      {
        ...graph.relations[0],
        to: { id: 'missing', version: 1 },
      },
    ],
  };
  const result = validateLineageGraph(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /missing to endpoint/);
});

test('authoritative relations require trusted evidence', () => {
  const invalid = {
    ...graph,
    relations: [
      {
        ...graph.relations[0],
        evidence: [{ id: 'ev-x', digest: digest('f'), provenance: 'UNTRUSTED' }],
      },
    ],
  };
  const result = validateLineageGraph(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /requires trusted provenance/);
});

test('revision-sensitive entities require exact revision binding', () => {
  const invalid = {
    ...graph,
    entities: graph.entities.map((entity) =>
      entity.id === 'code-1' ? { ...entity, revision: undefined } : entity,
    ),
  };
  const result = validateLineageGraph(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /requires exact revision binding/);
});

test('semantic discovery relation cannot become authoritative', () => {
  const invalid = {
    ...graph,
    relations: [
      ...graph.relations,
      {
        schemaVersion: 1,
        id: 'rel-discovery',
        kind: 'RELATED_TO',
        relationClass: 'AUTHORITATIVE',
        from: { id: 'code-1', version: 1 },
        to: { id: 'test-1', version: 1 },
        evidence: trustedEvidence,
      },
    ],
  };
  const result = validateLineageGraph(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /RELATED_TO must remain DISCOVERY/);
});

test('lineage traversal is bounded', () => {
  assert.throws(
    () => traverseLineage(graph, { id: 'req-1', version: 1 }, 11),
    /maxDepth must be an integer between 0 and 10/,
  );
});
