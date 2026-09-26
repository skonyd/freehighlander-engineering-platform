import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FhKuikaLocalSemanticIndexV1,
  localSemanticIndexCanCreateAuthoritativeLineage,
  localSemanticIndexCanGrantAuthority,
  localSemanticIndexCanInvokeModel,
  localSemanticIndexCanUseRemoteProvider,
} from '../dist/index.js';

const documents = [
  {
    id: 'incident-1',
    label: 'Database latency incident',
    sourceId: 'INC-1@1',
    sourceDigest: 'a'.repeat(64),
    evidenceIds: ['ev-1'],
    vector: [1, 0, 0],
  },
  {
    id: 'incident-2',
    label: 'Network timeout incident',
    sourceId: 'INC-2@1',
    sourceDigest: 'b'.repeat(64),
    evidenceIds: ['ev-2'],
    vector: [0, 1, 0],
  },
];

test('local semantic index returns deterministic discovery-only results', () => {
  const index = new FhKuikaLocalSemanticIndexV1(documents, { dimensions: 3 });
  const first = index.search([0.9, 0.1, 0], 2);
  const second = index.search([0.9, 0.1, 0], 2);

  assert.deepEqual(first, second);
  assert.equal(first[0]?.id, 'semantic:incident-1');
  assert.equal(first[0]?.resultClass, 'DISCOVERY');
  assert.equal(first[0]?.provenance.sourceKind, 'SEMANTIC_DISCOVERY');
  assert.equal(first[0]?.authority, 'NONE');

  assert.equal(localSemanticIndexCanGrantAuthority(), false);
  assert.equal(localSemanticIndexCanInvokeModel(), false);
  assert.equal(localSemanticIndexCanUseRemoteProvider(), false);
  assert.equal(localSemanticIndexCanCreateAuthoritativeLineage(), false);
});

test('local semantic index normalizes cosine ranking and uses stable tie break', () => {
  const index = new FhKuikaLocalSemanticIndexV1(
    [
      {
        id: 'b',
        label: 'B',
        sourceId: 'B@1',
        evidenceIds: [],
        vector: [1, 1],
      },
      {
        id: 'a',
        label: 'A',
        sourceId: 'A@1',
        evidenceIds: [],
        vector: [1, 1],
      },
    ],
    { dimensions: 2 },
  );

  const results = index.search([2, 2], 2);
  assert.deepEqual(results.map((item) => item.id), ['semantic:a', 'semantic:b']);
  assert.equal(results[0]?.semanticScore, 1);
});

test('local semantic index rejects invalid vectors, duplicates and unsafe bounds', () => {
  assert.throws(
    () => new FhKuikaLocalSemanticIndexV1(documents, { dimensions: 2 }),
    /dimensions must equal/,
  );
  assert.throws(
    () =>
      new FhKuikaLocalSemanticIndexV1(
        [documents[0], documents[0]],
        { dimensions: 3 },
      ),
    /duplicate semantic document id/,
  );
  assert.throws(
    () =>
      new FhKuikaLocalSemanticIndexV1(
        [{ ...documents[0], vector: [0, 0, 0] }],
        { dimensions: 3 },
      ),
    /zero vector/,
  );

  const index = new FhKuikaLocalSemanticIndexV1(documents, { dimensions: 3 });
  assert.throws(() => index.search([1, 0], 1), /dimensions must equal/);
  assert.throws(() => index.search([1, 0, 0], 101), /limit/);
});

test('semantic index preserves revision and evidence provenance without authority', () => {
  const index = new FhKuikaLocalSemanticIndexV1(
    [
      {
        id: 'release-1',
        label: 'Release incident',
        sourceId: 'INC-9@1',
        sourceDigest: 'c'.repeat(64),
        revision: {
          repository: 'skonyd/freehighlander-engineering-platform',
          sha: 'd'.repeat(40),
        },
        evidenceIds: ['evidence-9'],
        vector: [0, 0, 1],
      },
    ],
    { dimensions: 3 },
  );

  const result = index.search([0, 0, 1], 1)[0];
  assert.equal(result?.provenance.revision?.sha, 'd'.repeat(40));
  assert.deepEqual(result?.provenance.evidenceIds, ['evidence-9']);
  assert.equal(result?.resultClass, 'DISCOVERY');
});
