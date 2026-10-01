import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  applyFhKuikaRuntimeFailoverV1,
  createRoleBindingFailoverState,
  fhKuikaRuntimeFailoverCanGrantAuthority,
  fhKuikaRuntimeFailoverCanUseSemanticOutcome,
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
  for (const binding of [
    ['opus', 'anthropic', 'opus-5.5'],
    ['gpt', 'openai', 'gpt-6'],
    ['gemini', 'google', 'gemini-pro'],
  ]) {
    bindings.register({
      id: binding[0],
      version: '1.0.0',
      providerId: binding[1],
      model: binding[2],
      effort: 'medium',
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

test('FH-KUIKA runtime advances fallback only for availability-class failures', () => {
  const bindingPlan = plan();

  for (const failureKind of [
    'quota_exhausted',
    'rate_limited',
    'auth_unavailable',
    'provider_unavailable',
    'transport_failure',
  ]) {
    const state = createRoleBindingFailoverState(bindingPlan, policy);
    const decision = applyFhKuikaRuntimeFailoverV1(state, bindingPlan, {
      failureKind,
      scope: 'BINDING',
      observedAt: '2026-10-01T12:00:00.000Z',
      retryAfterMs: 1000,
      availabilityByBinding: { opus: false, gpt: true, gemini: true },
    });

    assert.equal(decision.failoverApplied, true);
    assert.equal(decision.transition.status, 'SWITCHED_TO_FALLBACK');
    assert.equal(decision.transition.selectedBindingId, 'gpt');
    assert.equal(decision.semanticOutcomeConsidered, false);
    assert.equal(decision.authority, 'NONE');
  }
});

test('semantic and malformed outcomes never trigger model shopping', () => {
  const bindingPlan = plan();

  for (const failureKind of ['semantic_failure', 'malformed_output']) {
    const state = createRoleBindingFailoverState(bindingPlan, policy);
    const decision = applyFhKuikaRuntimeFailoverV1(state, bindingPlan, {
      failureKind,
      scope: 'BINDING',
      observedAt: '2026-10-01T12:00:00.000Z',
      availabilityByBinding: { opus: false, gpt: true, gemini: true },
    });

    assert.equal(decision.failoverApplied, false);
    assert.equal(decision.transition.status, 'FALLBACK_FORBIDDEN');
    assert.equal(decision.transition.state.stateHash, state.stateHash);
    assert.equal(decision.semanticOutcomeConsidered, false);
  }

  assert.equal(fhKuikaRuntimeFailoverCanUseSemanticOutcome(), false);
  assert.equal(fhKuikaRuntimeFailoverCanGrantAuthority(), false);
});

test('availability failure with no eligible fallback remains fail-closed', () => {
  const bindingPlan = plan();
  const state = createRoleBindingFailoverState(bindingPlan, policy);
  const decision = applyFhKuikaRuntimeFailoverV1(state, bindingPlan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-10-01T12:00:00.000Z',
    retryAfterMs: 1000,
    availabilityByBinding: { opus: false, gpt: false, gemini: false },
  });

  assert.equal(decision.failoverApplied, false);
  assert.equal(decision.transition.status, 'NO_FALLBACK_AVAILABLE');
  assert.equal(decision.transition.state.activeBindingId, 'opus');
});
