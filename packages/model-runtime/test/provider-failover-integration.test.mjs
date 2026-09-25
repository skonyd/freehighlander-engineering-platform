import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  GeminiProviderInvocationError,
  ProviderInvocationError,
  ProviderRegistry,
  applyProviderInvocationFailure,
  createRoleBindingFailoverState,
  normalizeProviderInvocationFailure,
  providerFailureIntegrationCanGrantAuthority,
  providerFailureScope,
  resolveBindingPlan,
} from '../dist/index.js';

function provider(id) {
  return {
    id,
    capabilities: () => new Set(),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
  };
}

function plan() {
  const providers = new ProviderRegistry();
  providers.register(provider('anthropic'));
  providers.register(provider('openai'));
  providers.register(provider('google'));

  const bindings = new BindingRegistry();
  for (const [id, providerId, model] of [
    ['opus', 'anthropic', 'opus-5.5'],
    ['gpt', 'openai', 'gpt-6'],
    ['gemini', 'google', 'gemini-pro'],
  ]) {
    bindings.register({
      id,
      version: '1.0.0',
      providerId,
      model,
      allowedRiskTiers: ['NORMAL'],
      independenceGroup: 'implementation',
    });
  }

  return resolveBindingPlan(providers, bindings, {
    logicalRole: 'implementation',
    riskTier: 'NORMAL',
    primaryBindingId: 'opus',
    fallbackBindingIds: ['gpt', 'gemini'],
  });
}

const policy = {
  returnPolicy: 'ASK_BEFORE_RETURN',
  unknownResetRecheckMs: 60_000,
};

test('OpenAI-compatible and Gemini invocation errors normalize to the same failover signal', () => {
  const openai = normalizeProviderInvocationFailure(
    new ProviderInvocationError('quota', 'quota_exhausted', 429, 2_000),
  );
  assert.deepEqual(openai, {
    schemaVersion: 1,
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    retryAfterMs: 2_000,
    httpStatus: 429,
    authority: 'NONE',
  });

  const gemini = normalizeProviderInvocationFailure(
    new GeminiProviderInvocationError('rate', 'rate_limited', 429, 5_000),
  );
  assert.deepEqual(gemini, {
    schemaVersion: 1,
    failureKind: 'rate_limited',
    scope: 'BINDING',
    retryAfterMs: 5_000,
    httpStatus: 429,
    authority: 'NONE',
  });
});

test('quota and rate limits are binding-scoped while provider failures are provider-scoped', () => {
  assert.equal(providerFailureScope('quota_exhausted'), 'BINDING');
  assert.equal(providerFailureScope('rate_limited'), 'BINDING');
  for (const kind of [
    'auth_unavailable',
    'provider_unavailable',
    'transport_failure',
    'semantic_failure',
    'malformed_output',
  ]) {
    assert.equal(providerFailureScope(kind), 'PROVIDER');
  }
});

test('real provider retry-after metadata drives deterministic cooldown and ordered fallback', () => {
  const bindingPlan = plan();
  const state = createRoleBindingFailoverState(bindingPlan, policy);

  const transition = applyProviderInvocationFailure(
    state,
    bindingPlan,
    new ProviderInvocationError('quota exhausted', 'quota_exhausted', 429, 90_000),
    {
      observedAt: '2026-09-25T18:00:00.000Z',
      availabilityByBinding: { opus: false, gpt: true, gemini: true },
    },
  );

  assert.equal(transition.status, 'SWITCHED_TO_FALLBACK');
  assert.equal(transition.selectedBindingId, 'gpt');
  assert.equal(transition.state.activeBindingId, 'gpt');
  assert.equal(transition.state.cooldowns[0].timingSource, 'RETRY_AFTER');
  assert.equal(transition.state.cooldowns[0].nextCheckAt, '2026-09-25T18:01:30.000Z');
});

test('semantic and malformed provider errors remain recognized but cannot model-shop', () => {
  const bindingPlan = plan();
  const state = createRoleBindingFailoverState(bindingPlan, policy);

  for (const error of [
    new ProviderInvocationError('semantic reject', 'semantic_failure'),
    new GeminiProviderInvocationError('bad schema', 'malformed_output'),
  ]) {
    const normalized = normalizeProviderInvocationFailure(error);
    assert.ok(normalized);

    const transition = applyProviderInvocationFailure(state, bindingPlan, error, {
      observedAt: '2026-09-25T18:00:00.000Z',
      availabilityByBinding: { opus: false, gpt: true, gemini: true },
    });
    assert.equal(transition.status, 'FALLBACK_FORBIDDEN');
    assert.equal(transition.state.stateHash, state.stateHash);
  }
});

test('unrecognized or malformed failure metadata cannot trigger fallback', () => {
  assert.equal(normalizeProviderInvocationFailure(new Error('plain error')), null);
  assert.equal(normalizeProviderInvocationFailure({ kind: 'unknown' }), null);

  const normalized = normalizeProviderInvocationFailure({
    kind: 'quota_exhausted',
    retryAfterMs: '2000',
    status: 42,
  });
  assert.deepEqual(normalized, {
    schemaVersion: 1,
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    authority: 'NONE',
  });

  const bindingPlan = plan();
  const state = createRoleBindingFailoverState(bindingPlan, policy);
  const transition = applyProviderInvocationFailure(state, bindingPlan, new Error('plain'), {
    observedAt: '2026-09-25T18:00:00.000Z',
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  });
  assert.equal(transition.status, 'FALLBACK_FORBIDDEN');
  assert.equal(transition.state.stateHash, state.stateHash);
});

test('provider failure integration remains authority-neutral', () => {
  assert.equal(providerFailureIntegrationCanGrantAuthority(), false);
});
