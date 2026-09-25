import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeterministicContextReductionPlan,
  deterministicReductionPlanCanDropProtectedEvidence,
  deterministicReductionPlanCanGrantAuthority,
  validateDeterministicContextReductionPlan,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

test('deterministic reduction planning is input-order independent', () => {
  const inputs = [
    {
      id: 'b',
      contentHash: hash('1'),
      estimatedTokens: 20,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'a',
      contentHash: hash('2'),
      estimatedTokens: 10,
      compressionClass: 'PROTECTED',
      lifecycleState: 'ACTIVE',
    },
  ];

  const first = buildDeterministicContextReductionPlan(inputs);
  const second = buildDeterministicContextReductionPlan([...inputs].reverse());

  assert.equal(first.planHash, second.planHash);
  assert.deepEqual(first.items, second.items);
  assert.doesNotThrow(() => validateDeterministicContextReductionPlan(first));
});

test('required and protected evidence is kept and never counted as droppable', () => {
  const plan = buildDeterministicContextReductionPlan([
    {
      id: 'required',
      contentHash: hash('1'),
      estimatedTokens: 100,
      compressionClass: 'PROTECTED',
      lifecycleState: 'ACTIVE',
      requiredByGate: true,
    },
    {
      id: 'same-content-supporting-copy',
      contentHash: hash('1'),
      estimatedTokens: 100,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
  ]);

  const required = plan.items.find((item) => item.id === 'required');
  const duplicate = plan.items.find((item) => item.id === 'same-content-supporting-copy');

  assert.equal(required.action, 'KEEP');
  assert.equal(duplicate.action, 'DROP_EXACT_DUPLICATE');
  assert.equal(duplicate.duplicateOf, 'required');
  assert.equal(plan.protectedTokens, 100);
  assert.equal(plan.plannedDroppableTokens, 100);
  assert.equal(deterministicReductionPlanCanDropProtectedEvidence(), false);
});

test('two protected copies remain protected even when content hashes match', () => {
  const plan = buildDeterministicContextReductionPlan([
    {
      id: 'protected-a',
      contentHash: hash('1'),
      estimatedTokens: 40,
      compressionClass: 'PROTECTED',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'protected-b',
      contentHash: hash('1'),
      estimatedTokens: 40,
      compressionClass: 'PROTECTED',
      lifecycleState: 'ACTIVE',
    },
  ]);

  assert.deepEqual(
    plan.items.map((item) => item.action),
    ['KEEP', 'KEEP'],
  );
  assert.equal(plan.plannedDroppableTokens, 0);
  assert.equal(plan.protectedTokens, 80);
});

test('exact duplicate elimination precedes class-specific active reductions', () => {
  const plan = buildDeterministicContextReductionPlan([
    {
      id: 'lossless-a',
      contentHash: hash('1'),
      estimatedTokens: 30,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'lossless-b',
      contentHash: hash('1'),
      estimatedTokens: 30,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
  ]);

  assert.equal(plan.items[0].action, 'LOSSLESS_TRANSFORM');
  assert.equal(plan.items[1].action, 'DROP_EXACT_DUPLICATE');
  assert.equal(plan.items[1].duplicateOf, 'lossless-a');
  assert.equal(plan.plannedDroppableTokens, 30);
});

test('stale content drops before active extractive or semantic processing', () => {
  const plan = buildDeterministicContextReductionPlan([
    {
      id: 'extractive-active',
      contentHash: hash('1'),
      estimatedTokens: 10,
      compressionClass: 'EXTRACTIVE',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'extractive-stale',
      contentHash: hash('2'),
      estimatedTokens: 20,
      compressionClass: 'EXTRACTIVE',
      lifecycleState: 'SUPERSEDED',
    },
    {
      id: 'semantic-active',
      contentHash: hash('3'),
      estimatedTokens: 30,
      compressionClass: 'SEMANTIC_ALLOWED',
      lifecycleState: 'ACTIVE',
    },
    {
      id: 'semantic-expired',
      contentHash: hash('4'),
      estimatedTokens: 40,
      compressionClass: 'SEMANTIC_ALLOWED',
      lifecycleState: 'EXPIRED',
    },
  ]);

  assert.equal(plan.items.find((item) => item.id === 'extractive-active').action, 'EXTRACT');
  assert.equal(plan.items.find((item) => item.id === 'extractive-stale').action, 'DROP_STALE');
  assert.equal(
    plan.items.find((item) => item.id === 'semantic-active').action,
    'SEMANTIC_CANDIDATE',
  );
  assert.equal(plan.items.find((item) => item.id === 'semantic-expired').action, 'DROP_STALE');
  assert.equal(plan.candidateTokens, 100);
  assert.equal(plan.plannedDroppableTokens, 60);
});

test('requiredByGate cannot be mislabeled as reducible context', () => {
  assert.throws(
    () =>
      buildDeterministicContextReductionPlan([
        {
          id: 'bad-required',
          contentHash: hash('1'),
          estimatedTokens: 10,
          compressionClass: 'EXTRACTIVE',
          lifecycleState: 'ACTIVE',
          requiredByGate: true,
        },
      ]),
    /requiredByGate context must be classified PROTECTED/,
  );
});

test('tampered plan decisions, accounting and hash fail validation', () => {
  const plan = buildDeterministicContextReductionPlan([
    {
      id: 'manifest',
      contentHash: hash('1'),
      estimatedTokens: 10,
      compressionClass: 'LOSSLESS',
      lifecycleState: 'ACTIVE',
    },
  ]);

  assert.throws(
    () =>
      validateDeterministicContextReductionPlan({
        ...plan,
        items: [{ ...plan.items[0], action: 'KEEP' }],
      }),
    /item decision mismatch/,
  );
  assert.throws(
    () =>
      validateDeterministicContextReductionPlan({
        ...plan,
        candidateTokens: 11,
      }),
    /token accounting mismatch/,
  );
  assert.throws(
    () =>
      validateDeterministicContextReductionPlan({
        ...plan,
        planHash: hash('0'),
      }),
    /hash mismatch/,
  );
  assert.equal(deterministicReductionPlanCanGrantAuthority(), false);
});
