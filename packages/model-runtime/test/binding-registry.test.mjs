import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  bindingFallbackCanOverrideSemanticFailure,
  bindingRegistryCanGrantAuthority,
} from '../dist/index.js';

function provider(id, capabilities) {
  return {
    id,
    capabilities: () => new Set(capabilities),
    health: async () => ({ available: true }),
    invoke: async (request) => ({ output: 'ok', model: request.model }),
  };
}

function registerDefaultBindings() {
  const providers = new ProviderRegistry();
  providers.register(
    provider('anthropic', ['structured_output', 'reasoning_effort', 'usage_token_breakdown']),
  );
  providers.register(
    provider('openai', ['structured_output', 'reasoning_effort', 'usage_token_breakdown']),
  );

  const bindings = new BindingRegistry(providers);
  bindings.register({
    id: 'opus-medium',
    providerId: 'anthropic',
    model: 'opus',
    capabilities: ['structured_output', 'reasoning_effort'],
    independenceGroup: 'anthropic-primary',
    allowedRiskTiers: ['NORMAL', 'HIGH', 'CRITICAL'],
    effort: 'medium',
  });
  bindings.register({
    id: 'gpt-high',
    providerId: 'openai',
    model: 'gpt',
    capabilities: ['structured_output', 'reasoning_effort'],
    independenceGroup: 'openai-primary',
    allowedRiskTiers: ['NORMAL', 'HIGH'],
    effort: 'high',
  });

  return { providers, bindings };
}

const plan = {
  id: 'test-reviewer-default',
  logicalRole: 'test-reviewer',
  primaryBindingId: 'opus-medium',
  fallbackBindingIds: ['gpt-high'],
  fallbackPolicy: 'availability-only',
  requiredCapabilities: ['structured_output'],
};

test('provider and binding IDs are unique and provider references fail closed', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('local', ['usage_token_breakdown']));

  assert.throws(
    () => providers.register(provider('local', ['usage_token_breakdown'])),
    /duplicate provider id/,
  );

  const bindings = new BindingRegistry(providers);
  bindings.register({
    id: 'local-qwen',
    providerId: 'local',
    model: 'qwen',
    capabilities: ['usage_token_breakdown'],
    independenceGroup: 'local-a',
    allowedRiskTiers: ['NORMAL'],
  });

  assert.throws(
    () =>
      bindings.register({
        id: 'local-qwen',
        providerId: 'local',
        model: 'other',
        capabilities: [],
        independenceGroup: 'local-b',
        allowedRiskTiers: ['NORMAL'],
      }),
    /duplicate binding id/,
  );

  assert.throws(
    () =>
      bindings.register({
        id: 'missing-provider',
        providerId: 'missing',
        model: 'model',
        capabilities: [],
        independenceGroup: 'group',
        allowedRiskTiers: ['NORMAL'],
      }),
    /unknown provider/,
  );
});

test('binding cannot advertise a capability the provider does not expose', () => {
  const providers = new ProviderRegistry();
  providers.register(provider('local', ['usage_token_breakdown']));
  const bindings = new BindingRegistry(providers);

  assert.throws(
    () =>
      bindings.register({
        id: 'invalid',
        providerId: 'local',
        model: 'qwen',
        capabilities: ['structured_output'],
        independenceGroup: 'local',
        allowedRiskTiers: ['NORMAL'],
      }),
    /unsupported provider capability/,
  );
});

test('eligible primary binding is selected without fallback', () => {
  const { bindings } = registerDefaultBindings();

  const result = bindings.select(plan, {
    riskTier: 'HIGH',
    requiredCapabilities: ['reasoning_effort'],
  });

  assert.equal(result.status, 'SELECTED');
  assert.equal(result.binding?.id, 'opus-medium');
  assert.equal(result.usedFallback, false);
});

test('availability failure or preflight unavailability may select an eligible fallback', () => {
  const { bindings } = registerDefaultBindings();

  const afterQuota = bindings.select(plan, {
    riskTier: 'HIGH',
    previousFailureKind: 'quota_exhausted',
    unavailableBindingIds: ['opus-medium'],
  });
  assert.equal(afterQuota.status, 'SELECTED');
  assert.equal(afterQuota.binding?.id, 'gpt-high');
  assert.equal(afterQuota.usedFallback, true);

  const preflightUnavailable = bindings.select(plan, {
    riskTier: 'NORMAL',
    unavailableBindingIds: ['opus-medium'],
  });
  assert.equal(preflightUnavailable.binding?.id, 'gpt-high');
  assert.equal(preflightUnavailable.usedFallback, true);
});

test('semantic or malformed output forbids fallback/model-shopping', () => {
  const { bindings } = registerDefaultBindings();

  for (const previousFailureKind of ['semantic_failure', 'malformed_output']) {
    const result = bindings.select(plan, {
      riskTier: 'NORMAL',
      previousFailureKind,
      unavailableBindingIds: ['opus-medium'],
    });

    assert.equal(result.status, 'FALLBACK_FORBIDDEN');
    assert.equal(result.binding, undefined);
    assert.equal(result.usedFallback, false);
  }

  assert.equal(bindingFallbackCanOverrideSemanticFailure(), false);
  assert.equal(bindingRegistryCanGrantAuthority(), false);
});

test('risk, capability and independence constraints apply equally to fallback', () => {
  const { bindings } = registerDefaultBindings();

  const critical = bindings.select(plan, {
    riskTier: 'CRITICAL',
    unavailableBindingIds: ['opus-medium'],
  });
  assert.equal(critical.status, 'NO_ELIGIBLE_BINDING');

  const capability = bindings.select(plan, {
    riskTier: 'NORMAL',
    unavailableBindingIds: ['opus-medium'],
    requiredCapabilities: ['prompt_caching'],
  });
  assert.equal(capability.status, 'NO_ELIGIBLE_BINDING');

  const independence = bindings.select(plan, {
    riskTier: 'NORMAL',
    unavailableBindingIds: ['opus-medium'],
    forbiddenIndependenceGroups: ['openai-primary'],
  });
  assert.equal(independence.status, 'NO_ELIGIBLE_BINDING');
});

test('binding plan rejects duplicate and unknown references', () => {
  const { bindings } = registerDefaultBindings();

  assert.throws(
    () =>
      bindings.validatePlan({
        ...plan,
        fallbackBindingIds: ['opus-medium'],
      }),
    /duplicate binding/,
  );

  assert.throws(
    () =>
      bindings.validatePlan({
        ...plan,
        fallbackBindingIds: ['unknown'],
      }),
    /unknown binding/,
  );
});

test('binding plan snapshot hash is deterministic and semantic-input bound', () => {
  const { bindings } = registerDefaultBindings();

  const first = bindings.snapshot(plan);
  const second = bindings.snapshot({ ...plan, fallbackBindingIds: ['gpt-high'] });
  assert.equal(first.hash, second.hash);
  assert.match(first.hash, /^[a-f0-9]{64}$/);

  const changed = bindings.snapshot({
    ...plan,
    requiredCapabilities: ['structured_output', 'reasoning_effort'],
  });
  assert.notEqual(first.hash, changed.hash);
});
