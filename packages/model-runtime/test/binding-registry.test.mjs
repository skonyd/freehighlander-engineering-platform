import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  bindingRegistryCanGrantAuthority,
  reconcileModelCatalog,
  resolveBindingPlan,
  selectBinding,
} from '../dist/index.js';

function provider(id, capabilities = []) {
  return {
    id,
    capabilities: () => new Set(capabilities),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
  };
}

test('provider and binding registries reject duplicate IDs', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1'));
  assert.throws(() => providers.register(provider('p1')), /duplicate provider id/);

  const bindings = new BindingRegistry();
  const binding = {
    id: 'b1',
    version: '1.0.0',
    providerId: 'p1',
    model: 'm1',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'group-a',
  };
  bindings.register(binding);
  assert.throws(() => bindings.register(binding), /duplicate binding id/);
});

test('binding plan is deterministic and authority-neutral', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1', ['structured_output']));
  providers.register(provider('p2', ['structured_output']));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'primary',
    version: '1.0.0',
    providerId: 'p1',
    model: 'm1',
    effort: 'medium',
    requiredCapabilities: ['structured_output'],
    allowedRiskTiers: ['NORMAL', 'HIGH'],
    independenceGroup: 'review-a',
  });
  bindings.register({
    id: 'fallback',
    version: '1.0.0',
    providerId: 'p2',
    model: 'm2',
    effort: 'medium',
    requiredCapabilities: ['structured_output'],
    allowedRiskTiers: ['NORMAL', 'HIGH'],
    independenceGroup: 'review-a',
  });

  const request = {
    logicalRole: 'test-reviewer',
    riskTier: 'HIGH',
    requiredCapabilities: ['structured_output'],
    requiredIndependenceGroup: 'review-a',
    primaryBindingId: 'primary',
    fallbackBindingIds: ['fallback'],
  };

  const first = resolveBindingPlan(providers, bindings, request);
  const second = resolveBindingPlan(providers, bindings, request);

  assert.equal(first.hash, second.hash);
  assert.equal(first.authorityGranted, false);
  assert.equal(bindingRegistryCanGrantAuthority(), false);
  assert.deepEqual(
    first.bindings.map((item) => item.bindingId),
    ['primary', 'fallback'],
  );
});

test('unavailable primary may select eligible fallback', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1'));
  providers.register(provider('p2'));

  const bindings = new BindingRegistry();
  for (const [id, providerId] of [
    ['primary', 'p1'],
    ['fallback', 'p2'],
  ]) {
    bindings.register({
      id,
      version: '1.0.0',
      providerId,
      model: id,
      allowedRiskTiers: ['NORMAL'],
      independenceGroup: 'g',
    });
  }

  const plan = resolveBindingPlan(providers, bindings, {
    logicalRole: 'repo-analysis',
    riskTier: 'NORMAL',
    primaryBindingId: 'primary',
    fallbackBindingIds: ['fallback'],
  });

  const selected = selectBinding(plan, { p1: false, p2: true }, 'provider_unavailable');
  assert.equal(selected.status, 'SELECTED');
  assert.equal(selected.binding.bindingId, 'fallback');
  assert.equal(selected.fallbackUsed, true);
});

test('semantic or malformed failure cannot model-shop to fallback', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1'));
  providers.register(provider('p2'));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'primary',
    version: '1.0.0',
    providerId: 'p1',
    model: 'm1',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });
  bindings.register({
    id: 'fallback',
    version: '1.0.0',
    providerId: 'p2',
    model: 'm2',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });

  const plan = resolveBindingPlan(providers, bindings, {
    logicalRole: 'reviewer',
    riskTier: 'NORMAL',
    primaryBindingId: 'primary',
    fallbackBindingIds: ['fallback'],
  });

  for (const failure of ['semantic_failure', 'malformed_output']) {
    const result = selectBinding(plan, { p1: false, p2: true }, failure);
    assert.equal(result.status, 'SEMANTIC_FAILURE_NO_FALLBACK');
    assert.equal(result.fallbackUsed, false);
  }
});

test('capability, risk and independence incompatibility fail closed', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1'));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'b1',
    version: '1.0.0',
    providerId: 'p1',
    model: 'm1',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'group-a',
  });

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'HIGH',
        primaryBindingId: 'b1',
      }),
    /not allowed for risk tier/,
  );

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'NORMAL',
        requiredCapabilities: ['structured_output'],
        primaryBindingId: 'b1',
      }),
    /unsupported capability/,
  );

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'NORMAL',
        requiredIndependenceGroup: 'group-b',
        primaryBindingId: 'b1',
      }),
    /does not satisfy/,
  );
});

test('unknown provider and binding references fail closed', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1'));
  const bindings = new BindingRegistry();

  bindings.register({
    id: 'bad-provider',
    version: '1.0.0',
    providerId: 'missing',
    model: 'm',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'x',
        riskTier: 'NORMAL',
        primaryBindingId: 'missing-binding',
      }),
    /unknown binding/,
  );

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'x',
        riskTier: 'NORMAL',
        primaryBindingId: 'bad-provider',
      }),
    /unknown provider/,
  );
});


function catalog(providerId, models) {
  return reconcileModelCatalog({
    providerId,
    refreshedAt: '2026-09-24T18:00:00.000Z',
    discovered: models.map((item) => ({
      providerId,
      modelId: item.modelId,
      locality: 'REMOTE',
      source: 'DISCOVERED',
      capabilities: item.capabilities ?? [],
      supportedEfforts: item.supportedEfforts ?? [],
      ...(item.availability ? { availability: item.availability } : {}),
    })),
  });
}

test('catalog-aware binding plan rejects unavailable and unknown models for new runs', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1', ['structured_output']));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'removed',
    version: '1.0.0',
    providerId: 'p1',
    model: 'removed-model',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });
  bindings.register({
    id: 'unknown',
    version: '1.0.0',
    providerId: 'p1',
    model: 'unknown-model',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });

  const first = catalog('p1', [
    { modelId: 'removed-model', capabilities: ['structured_output'] },
  ]);
  const refreshed = reconcileModelCatalog({
    providerId: 'p1',
    refreshedAt: '2026-09-24T19:00:00.000Z',
    previous: first,
    discovered: [],
  });

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'NORMAL',
        primaryBindingId: 'removed',
        catalogByProvider: { p1: refreshed },
      }),
    /model removed-model is unavailable/,
  );

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'NORMAL',
        primaryBindingId: 'unknown',
        catalogByProvider: { p1: refreshed },
      }),
    /model unknown-model is unknown_model/,
  );
});

test('catalog-aware binding plan validates model effort and model-level capabilities', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1', ['structured_output', 'tool_calling']));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'bad-effort',
    version: '1.0.0',
    providerId: 'p1',
    model: 'model-a',
    effort: 'high',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });
  bindings.register({
    id: 'bad-capability',
    version: '1.0.0',
    providerId: 'p1',
    model: 'model-a',
    requiredCapabilities: ['tool_calling'],
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });

  const snapshot = catalog('p1', [
    {
      modelId: 'model-a',
      capabilities: ['structured_output'],
      supportedEfforts: ['low', 'medium'],
    },
  ]);

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'NORMAL',
        primaryBindingId: 'bad-effort',
        catalogByProvider: { p1: snapshot },
      }),
    /effort high is unsupported/,
  );

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'reviewer',
        riskTier: 'NORMAL',
        primaryBindingId: 'bad-capability',
        catalogByProvider: { p1: snapshot },
      }),
    /lacks required capability tool_calling/,
  );
});

test('catalog-aware binding plan accepts eligible model and preserves immutable plan identity', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1', ['structured_output']));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'eligible',
    version: '2.0.0',
    providerId: 'p1',
    model: 'model-a',
    effort: 'medium',
    requiredCapabilities: ['structured_output'],
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });

  const snapshot = catalog('p1', [
    {
      modelId: 'model-a',
      capabilities: ['structured_output'],
      supportedEfforts: ['low', 'medium', 'high'],
    },
  ]);

  const plan = resolveBindingPlan(providers, bindings, {
    logicalRole: 'controller',
    riskTier: 'NORMAL',
    primaryBindingId: 'eligible',
    catalogByProvider: { p1: snapshot },
  });

  assert.equal(plan.bindings[0].model, 'model-a');
  assert.equal(plan.bindings[0].effort, 'medium');
  assert.equal(plan.catalogHashes.p1, snapshot.hash);
  assert.equal(plan.authorityGranted, false);

  const later = reconcileModelCatalog({
    providerId: 'p1',
    refreshedAt: '2026-09-24T20:00:00.000Z',
    previous: snapshot,
    discovered: [],
  });
  assert.equal(later.records[0].availability, 'UNAVAILABLE');
  assert.equal(plan.bindings[0].model, 'model-a');
  assert.equal(plan.bindings[0].effort, 'medium');

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'controller',
        riskTier: 'NORMAL',
        primaryBindingId: 'eligible',
        catalogByProvider: { p1: later },
      }),
    /model model-a is unavailable/,
  );
});

test('catalog-aware mode fails closed when a referenced provider has no catalog snapshot', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('p1'));
  const bindings = new BindingRegistry();
  bindings.register({
    id: 'b1',
    version: '1.0.0',
    providerId: 'p1',
    model: 'm1',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'g',
  });

  assert.throws(
    () =>
      resolveBindingPlan(providers, bindings, {
        logicalRole: 'controller',
        riskTier: 'NORMAL',
        primaryBindingId: 'b1',
        catalogByProvider: {},
      }),
    /no catalog snapshot/,
  );
});
