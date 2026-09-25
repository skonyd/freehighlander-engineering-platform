import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRepositoryMap,
  jitSelectionCanDropRequiredPathsForBudget,
  repositoryMapCanGrantAuthority,
  selectJitRepositoryContext,
  validateRepositoryMap,
} from '../dist/index.js';

function entry(path, symbols, imports, estimatedTokens) {
  return { path, symbols, imports, estimatedTokens };
}

const entries = [
  entry('src/controller.ts', ['Controller', 'runController'], ['src/policy.ts'], 120),
  entry('src/policy.ts', ['evaluatePolicy'], [], 80),
  entry('src/provider.ts', ['ProviderAdapter', 'invokeProvider'], [], 100),
  entry('src/unrelated.ts', ['renderBanner'], [], 200),
];

test('repository map is deterministic and input-order independent', () => {
  const first = buildRepositoryMap('abc123', entries);
  const second = buildRepositoryMap('abc123', [...entries].reverse());

  assert.equal(first.mapHash, second.mapHash);
  assert.deepEqual(first.entries, second.entries);
  assert.equal(first.authority, 'NONE');
  assert.doesNotThrow(() => validateRepositoryMap(first));
});

test('JIT selection always keeps required paths even when they exceed target', () => {
  const map = buildRepositoryMap('abc123', entries);
  const selection = selectJitRepositoryContext({
    map,
    query: 'policy',
    changedPaths: [],
    requiredPaths: ['src/controller.ts', 'src/policy.ts'],
    targetTokens: 100,
  });

  assert.deepEqual(selection.requiredPaths, ['src/controller.ts', 'src/policy.ts']);
  assert.deepEqual(selection.selectedPaths, ['src/controller.ts', 'src/policy.ts']);
  assert.equal(selection.estimatedTokens, 200);
  assert.equal(selection.targetExceededForRequiredContext, true);
  assert.equal(jitSelectionCanDropRequiredPathsForBudget(), false);
});

test('changed paths receive priority within remaining token budget', () => {
  const map = buildRepositoryMap('abc123', entries);
  const selection = selectJitRepositoryContext({
    map,
    query: 'provider policy',
    changedPaths: ['src/provider.ts'],
    requiredPaths: ['src/policy.ts'],
    targetTokens: 180,
  });

  assert.deepEqual(selection.selectedPaths, ['src/policy.ts', 'src/provider.ts']);
  assert.equal(selection.estimatedTokens, 180);
  assert.equal(selection.targetExceededForRequiredContext, false);
});

test('symbol and path relevance select useful files instead of unrelated files', () => {
  const map = buildRepositoryMap('abc123', entries);
  const selection = selectJitRepositoryContext({
    map,
    query: 'runController evaluatePolicy',
    changedPaths: [],
    requiredPaths: [],
    targetTokens: 200,
  });

  assert.deepEqual(selection.selectedPaths, ['src/controller.ts', 'src/policy.ts']);
  assert.equal(selection.estimatedTokens, 200);
  assert.equal(selection.selectedPaths.includes('src/unrelated.ts'), false);
});

test('selection is deterministic regardless of map input ordering', () => {
  const first = buildRepositoryMap('abc123', entries);
  const second = buildRepositoryMap('abc123', [...entries].reverse());

  const firstSelection = selectJitRepositoryContext({
    map: first,
    query: 'policy provider',
    changedPaths: [],
    requiredPaths: [],
    targetTokens: 180,
  });
  const secondSelection = selectJitRepositoryContext({
    map: second,
    query: 'policy provider',
    changedPaths: [],
    requiredPaths: [],
    targetTokens: 180,
  });

  assert.deepEqual(firstSelection, secondSelection);
});

test('repository map remains authority-neutral', () => {
  assert.equal(repositoryMapCanGrantAuthority(), false);
});

test('map normalizes symbols imports and repository-relative paths', () => {
  const map = buildRepositoryMap('abc123', [
    entry('./src/a.ts', ['B', 'A', 'A'], ['src/c.ts', './src/b.ts', 'src/c.ts'], 10),
  ]);

  assert.equal(map.entries[0].path, 'src/a.ts');
  assert.deepEqual(map.entries[0].symbols, ['A', 'B']);
  assert.deepEqual(map.entries[0].imports, ['src/b.ts', 'src/c.ts']);
});

test('map and selector fail closed on malformed or stale inputs', () => {
  assert.throws(() => buildRepositoryMap('', entries), /exactRevision is required/);
  assert.throws(() => buildRepositoryMap('abc123', []), /at least one entry/);
  assert.throws(
    () => buildRepositoryMap('abc123', [entry('../escape.ts', [], [], 1)]),
    /repository-relative/,
  );
  assert.throws(
    () => buildRepositoryMap('abc123', [entry('a.ts', [], [], -1)]),
    /non-negative integer/,
  );
  assert.throws(
    () =>
      buildRepositoryMap('abc123', [
        entry('a.ts', [], [], 1),
        entry('./a.ts', [], [], 1),
      ]),
    /duplicate repository map path/,
  );

  const map = buildRepositoryMap('abc123', entries);
  assert.throws(
    () => validateRepositoryMap({ ...map, mapHash: '0'.repeat(64) }),
    /hash mismatch/,
  );
  assert.throws(
    () =>
      selectJitRepositoryContext({
        map,
        query: 'policy',
        changedPaths: ['missing.ts'],
        requiredPaths: [],
        targetTokens: 100,
      }),
    /does not contain path/,
  );
  assert.throws(
    () =>
      selectJitRepositoryContext({
        map,
        query: 'policy',
        changedPaths: [],
        requiredPaths: [],
        targetTokens: -1,
      }),
    /non-negative integer/,
  );
});
