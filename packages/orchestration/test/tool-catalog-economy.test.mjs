import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateToolSchemas,
  buildLazyToolExposurePlan,
  lazyToolSchemaLoadingCanGrantAuthority,
  lazyToolSchemaLoadingCanHideRequiredCoreTools,
} from '../dist/index.js';

function tool(id, namespace, keywords, estimatedSchemaTokens = 100, core = false) {
  return {
    id,
    namespace,
    keywords,
    estimatedSchemaTokens,
    ...(core ? { core: true } : {}),
  };
}

test('small catalogs expose all schemas directly', () => {
  const tools = [
    tool('git.read', 'git', ['read']),
    tool('git.diff', 'git', ['diff']),
    tool('test.run', 'test', ['test']),
  ];

  const plan = buildLazyToolExposurePlan(tools);

  assert.equal(plan.profile, 'SMALL');
  assert.deepEqual(plan.initialSchemaToolIds, ['git.diff', 'git.read', 'test.run']);
  assert.deepEqual(plan.indexedToolIds, []);
  assert.equal(plan.requiresDiscovery, false);
  assert.equal(plan.estimatedInitialTokensAvoided, 0);
});

test('medium catalog exposes core schemas and indexes the rest', () => {
  const tools = Array.from({ length: 12 }, (_, index) =>
    tool(
      `tool-${String(index).padStart(2, '0')}`,
      index < 6 ? 'git' : 'ci',
      index < 6 ? ['git', 'repo'] : ['ci', 'test'],
      10,
      index === 0 || index === 1,
    ),
  );

  const plan = buildLazyToolExposurePlan(tools);

  assert.equal(plan.profile, 'MEDIUM');
  assert.deepEqual(plan.initialSchemaToolIds, ['tool-00', 'tool-01']);
  assert.equal(plan.indexedToolIds.length, 10);
  assert.equal(plan.totalCatalogSchemaTokens, 120);
  assert.equal(plan.initialSchemaTokens, 20);
  assert.equal(plan.estimatedInitialTokensAvoided, 100);
  assert.equal(plan.requiresDiscovery, true);
});

test('large catalog also requires discovery and keeps required core tools initially exposed', () => {
  const tools = Array.from({ length: 40 }, (_, index) =>
    tool(
      `tool-${String(index).padStart(2, '0')}`,
      index % 2 === 0 ? 'github' : 'filesystem',
      ['search', index % 2 === 0 ? 'pull-request' : 'file'],
      5,
      index === 0,
    ),
  );

  const plan = buildLazyToolExposurePlan(tools);

  assert.equal(plan.profile, 'LARGE');
  assert.deepEqual(plan.initialSchemaToolIds, ['tool-00']);
  assert.equal(plan.indexedToolIds.length, 39);
  assert.equal(plan.estimatedInitialTokensAvoided, 195);
  assert.equal(lazyToolSchemaLoadingCanHideRequiredCoreTools(), false);
});

test('discovery activates matching indexed schemas deterministically', () => {
  const tools = [
    tool('core.read', 'core', ['read'], 10, true),
    ...Array.from({ length: 8 }, (_, index) =>
      tool(
        `extra-${index}`,
        index < 4 ? 'github' : 'files',
        index === 2 ? ['pull-request', 'review'] : ['generic'],
        20,
      ),
    ),
  ];
  const plan = buildLazyToolExposurePlan(tools);
  const activation = activateToolSchemas(tools, plan, 'github pull request review', 2);

  assert.deepEqual(activation.matchedToolIds, ['extra-2', 'extra-0']);
  assert.deepEqual(activation.activatedToolIds, ['core.read', 'extra-0', 'extra-2']);
  assert.equal(activation.estimatedActivatedSchemaTokens, 50);
  assert.equal(activation.authority, 'NONE');
});

test('empty discovery query keeps only the initial core schema set', () => {
  const tools = [
    tool('core.read', 'core', ['read'], 10, true),
    ...Array.from({ length: 8 }, (_, index) => tool(`extra-${index}`, 'misc', ['generic'], 20)),
  ];
  const plan = buildLazyToolExposurePlan(tools);
  const activation = activateToolSchemas(tools, plan, '   ', 2);

  assert.deepEqual(activation.matchedToolIds, []);
  assert.deepEqual(activation.activatedToolIds, ['core.read']);
  assert.equal(activation.estimatedActivatedSchemaTokens, 10);
});

test('small catalog activation remains direct regardless of query', () => {
  const tools = [tool('git.read', 'git', ['read'], 10), tool('git.diff', 'git', ['diff'], 20)];
  const plan = buildLazyToolExposurePlan(tools);
  const activation = activateToolSchemas(tools, plan, 'unknown', 1);

  assert.deepEqual(activation.activatedToolIds, ['git.diff', 'git.read']);
  assert.deepEqual(activation.matchedToolIds, ['git.diff', 'git.read']);
  assert.equal(activation.estimatedActivatedSchemaTokens, 30);
});

test('tool selection never grants authority', () => {
  assert.equal(lazyToolSchemaLoadingCanGrantAuthority(), false);
});

test('catalog validation fails closed on malformed inputs', () => {
  assert.throws(() => buildLazyToolExposurePlan([]), /at least one tool/);
  assert.throws(
    () => buildLazyToolExposurePlan([tool('', 'git', ['read'])]),
    /tool id is required/,
  );
  assert.throws(
    () => buildLazyToolExposurePlan([tool('a', '', ['read'])]),
    /namespace is required/,
  );
  assert.throws(() => buildLazyToolExposurePlan([tool('a', 'git', [''])]), /keyword is required/);
  assert.throws(
    () => buildLazyToolExposurePlan([tool('a', 'git', ['read'], -1)]),
    /non-negative integer/,
  );
  assert.throws(
    () => buildLazyToolExposurePlan([tool('same', 'git', []), tool('same', 'ci', [])]),
    /duplicate tool id/,
  );
});

test('activation fails closed on stale plan and invalid activation bound', () => {
  const tools = [
    tool('core.read', 'core', ['read'], 10, true),
    ...Array.from({ length: 8 }, (_, index) => tool(`extra-${index}`, 'misc', ['generic'], 20)),
  ];
  const plan = buildLazyToolExposurePlan(tools);

  assert.throws(() =>
    activateToolSchemas(tools, { ...plan, authority: 'SYSTEM_POLICY' }, 'misc', 1),
  );
  assert.throws(
    () => activateToolSchemas([...tools, tool('late-tool', 'misc', ['late'], 10)], plan, 'late', 1),
    /does not match current catalog/,
  );
  assert.throws(() => activateToolSchemas(tools, plan, 'misc', 0), /maxActivated/);
});
