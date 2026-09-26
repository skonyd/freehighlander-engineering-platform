import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  buildRoleBindingFailoverTelemetrySnapshot,
  createPreferredBindingReturnApproval,
  createRoleBindingFailoverState,
  evaluatePreferredBindingReturn,
  listDueBindingChecks,
  quotaAwareFailoverCanGrantAuthority,
  recordActiveBindingFailure,
  recordBindingRecoveryObservation,
  resolveBindingPlan,
  semanticFailureCanAdvanceFallbackChain,
  validatePreferredBindingReturnApproval,
  validateRoleBindingFailoverState,
} from '../dist/index.js';

function provider(id) {
  return {
    id,
    capabilities: () => new Set(),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'ok', model: 'm' }),
  };
}

function planWithThreeBindings({ sameProvider = false } = {}) {
  const providers = new ProviderRegistry();
  providers.register(provider('anthropic'));
  providers.register(provider('openai'));
  providers.register(provider('google'));

  const bindings = new BindingRegistry();
  bindings.register({
    id: 'opus',
    version: '1.0.0',
    providerId: 'anthropic',
    model: 'opus-5.5',
    effort: 'low',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'writer',
  });
  bindings.register({
    id: 'gpt',
    version: '1.0.0',
    providerId: sameProvider ? 'anthropic' : 'openai',
    model: 'gpt-6',
    effort: 'medium',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'writer',
  });
  bindings.register({
    id: 'gemini',
    version: '1.0.0',
    providerId: 'google',
    model: 'gemini-pro',
    effort: 'medium',
    allowedRiskTiers: ['NORMAL'],
    independenceGroup: 'writer',
  });

  return resolveBindingPlan(providers, bindings, {
    logicalRole: 'implementation',
    riskTier: 'NORMAL',
    primaryBindingId: 'opus',
    fallbackBindingIds: ['gpt', 'gemini'],
  });
}

const askPolicy = {
  returnPolicy: 'ASK_BEFORE_RETURN',
  unknownResetRecheckMs: 60_000,
};

test('ordered quota exhaustion advances Opus -> GPT -> Gemini', () => {
  const plan = planWithThreeBindings();
  let state = createRoleBindingFailoverState(plan, askPolicy);

  const first = recordActiveBindingFailure(state, plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 3_600_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  });
  assert.equal(first.status, 'SWITCHED_TO_FALLBACK');
  assert.equal(first.selectedBindingId, 'gpt');
  assert.equal(first.state.activeBindingId, 'gpt');

  state = first.state;
  const second = recordActiveBindingFailure(state, plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:05:00.000Z',
    retryAfterMs: 7_200_000,
    availabilityByBinding: { opus: false, gpt: false, gemini: true },
  });
  assert.equal(second.status, 'SWITCHED_TO_FALLBACK');
  assert.equal(second.selectedBindingId, 'gemini');
  assert.equal(second.state.activeBindingId, 'gemini');
  assert.equal(second.state.cooldowns.length, 2);
});

test('same-provider model cooldown can remain binding-scoped', () => {
  const plan = planWithThreeBindings({ sameProvider: true });
  const state = createRoleBindingFailoverState(plan, askPolicy);

  const transition = recordActiveBindingFailure(state, plan, {
    failureKind: 'rate_limited',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 10_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  });

  assert.equal(transition.status, 'SWITCHED_TO_FALLBACK');
  assert.equal(transition.selectedBindingId, 'gpt');
  assert.equal(transition.state.cooldowns[0].scope, 'BINDING');
});

test('provider-scoped failure skips fallbacks on the same provider', () => {
  const plan = planWithThreeBindings({ sameProvider: true });
  const state = createRoleBindingFailoverState(plan, askPolicy);

  const transition = recordActiveBindingFailure(state, plan, {
    failureKind: 'provider_unavailable',
    scope: 'PROVIDER',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 30_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  });

  assert.equal(transition.status, 'SWITCHED_TO_FALLBACK');
  assert.equal(transition.selectedBindingId, 'gemini');
});

test('retry-after reset-at and bounded unknown reset produce deterministic nextCheckAt', () => {
  const plan = planWithThreeBindings();

  const retry = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'rate_limited',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 90_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;
  assert.equal(retry.cooldowns[0].timingSource, 'RETRY_AFTER');
  assert.equal(retry.cooldowns[0].nextCheckAt, '2026-09-25T18:01:30.000Z');

  const reset = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    resetAt: '2026-09-25T20:00:00.000Z',
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;
  assert.equal(reset.cooldowns[0].timingSource, 'RESET_AT');
  assert.equal(reset.nextCheckAt, '2026-09-25T20:00:00.000Z');

  const bounded = recordActiveBindingFailure(
    createRoleBindingFailoverState(plan, askPolicy),
    plan,
    {
      failureKind: 'quota_exhausted',
      scope: 'BINDING',
      observedAt: '2026-09-25T18:00:00.000Z',
      availabilityByBinding: { opus: false, gpt: true, gemini: true },
    },
  ).state;
  assert.equal(bounded.cooldowns[0].timingSource, 'BOUNDED_RECHECK');
  assert.equal(bounded.nextCheckAt, '2026-09-25T18:01:00.000Z');
});

test('due checks do not silently mark a binding recovered', () => {
  const plan = planWithThreeBindings();
  const state = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'rate_limited',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 10_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;

  assert.equal(listDueBindingChecks(state, '2026-09-25T18:00:09.000Z').length, 0);
  assert.equal(listDueBindingChecks(state, '2026-09-25T18:00:10.000Z').length, 1);

  const preferred = evaluatePreferredBindingReturn(state, plan, {
    preferredAvailable: true,
  });
  assert.equal(preferred.status, 'WAITING_FOR_RECOVERY');
});

test('successful recovery observation clears cooldown and ASK policy requires approval', () => {
  const plan = planWithThreeBindings();
  let state = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    resetAt: '2026-09-25T19:00:00.000Z',
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;

  state = recordBindingRecoveryObservation(state, plan, {
    bindingId: 'opus',
    observedAt: '2026-09-25T19:00:01.000Z',
    available: true,
  });
  assert.equal(state.cooldowns.length, 0);

  const pending = evaluatePreferredBindingReturn(state, plan, {
    preferredAvailable: true,
  });
  assert.equal(pending.status, 'APPROVAL_REQUIRED');

  const approval = createPreferredBindingReturnApproval(state, plan, {
    approverId: 'user-1',
    decidedAt: '2026-09-25T19:00:02.000Z',
    decision: 'APPROVE',
  });
  assert.doesNotThrow(() => validatePreferredBindingReturnApproval(approval, state, plan));

  const approved = evaluatePreferredBindingReturn(state, plan, {
    preferredAvailable: true,
    returnApproval: approval,
  });
  assert.equal(approved.status, 'RETURNED_TO_PREFERRED');
  assert.equal(approved.state.activeBindingId, 'opus');
  assert.match(approval.approvalHash, /^[a-f0-9]{64}$/);
  assert.equal(approval.authority, 'NONE');
});

test('ASK return approval is exact-bound and stale or denied decisions cannot return', () => {
  const plan = planWithThreeBindings();
  let state = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 1_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;
  state = recordBindingRecoveryObservation(state, plan, {
    bindingId: 'opus',
    observedAt: '2026-09-25T18:00:02.000Z',
    available: true,
  });

  const deniedApproval = createPreferredBindingReturnApproval(state, plan, {
    approverId: 'user-1',
    decidedAt: '2026-09-25T18:00:03.000Z',
    decision: 'DENY',
  });
  const denied = evaluatePreferredBindingReturn(state, plan, {
    preferredAvailable: true,
    returnApproval: deniedApproval,
  });
  assert.equal(denied.status, 'STAYING_ON_FALLBACK');
  assert.equal(denied.state.activeBindingId, 'gpt');

  const approved = createPreferredBindingReturnApproval(state, plan, {
    approverId: 'user-1',
    decidedAt: '2026-09-25T18:00:04.000Z',
    decision: 'APPROVE',
  });
  assert.throws(
    () =>
      validatePreferredBindingReturnApproval(
        { ...approved, stateHash: '0'.repeat(64) },
        state,
        plan,
      ),
    /state hash mismatch/,
  );
  assert.throws(
    () =>
      validatePreferredBindingReturnApproval(
        { ...approved, approvalHash: '0'.repeat(64) },
        state,
        plan,
      ),
    /approval hash mismatch/,
  );

  const changedState = recordActiveBindingFailure(state, plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:01:00.000Z',
    retryAfterMs: 2_000,
    availabilityByBinding: { opus: true, gpt: false, gemini: true },
  }).state;
  assert.throws(
    () =>
      evaluatePreferredBindingReturn(changedState, plan, {
        preferredAvailable: true,
        returnApproval: approved,
      }),
    /state hash mismatch/,
  );
});

test('AUTO_RETURN and STAY_ON_FALLBACK honor configured return policy', () => {
  const plan = planWithThreeBindings();

  function recoveredState(returnPolicy) {
    let state = recordActiveBindingFailure(
      createRoleBindingFailoverState(plan, {
        returnPolicy,
        unknownResetRecheckMs: 60_000,
      }),
      plan,
      {
        failureKind: 'quota_exhausted',
        scope: 'BINDING',
        observedAt: '2026-09-25T18:00:00.000Z',
        retryAfterMs: 1_000,
        availabilityByBinding: { opus: false, gpt: true, gemini: true },
      },
    ).state;
    state = recordBindingRecoveryObservation(state, plan, {
      bindingId: 'opus',
      observedAt: '2026-09-25T18:00:02.000Z',
      available: true,
    });
    return state;
  }

  const auto = evaluatePreferredBindingReturn(recoveredState('AUTO_RETURN'), plan, {
    preferredAvailable: true,
  });
  assert.equal(auto.status, 'RETURNED_TO_PREFERRED');

  const stay = evaluatePreferredBindingReturn(recoveredState('STAY_ON_FALLBACK'), plan, {
    preferredAvailable: true,
  });
  assert.equal(stay.status, 'STAYING_ON_FALLBACK');
  assert.equal(stay.state.activeBindingId, 'gpt');
});

test('failed recovery probe reschedules the next check instead of assuming recovery', () => {
  const plan = planWithThreeBindings();
  let state = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'rate_limited',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 1_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;

  state = recordBindingRecoveryObservation(state, plan, {
    bindingId: 'opus',
    observedAt: '2026-09-25T18:00:01.000Z',
    available: false,
    retryAfterMs: 5_000,
  });

  assert.equal(state.cooldowns[0].nextCheckAt, '2026-09-25T18:00:06.000Z');
  assert.equal(state.cooldowns[0].timingSource, 'RETRY_AFTER');
});

test('semantic and malformed failures never advance the fallback chain', () => {
  const plan = planWithThreeBindings();
  const state = createRoleBindingFailoverState(plan, askPolicy);

  for (const failureKind of ['semantic_failure', 'malformed_output']) {
    const transition = recordActiveBindingFailure(state, plan, {
      failureKind,
      scope: 'BINDING',
      observedAt: '2026-09-25T18:00:00.000Z',
      availabilityByBinding: { opus: false, gpt: true, gemini: true },
    });
    assert.equal(transition.status, 'FALLBACK_FORBIDDEN');
    assert.equal(transition.state.stateHash, state.stateHash);
  }
  assert.equal(semanticFailureCanAdvanceFallbackChain(), false);
});

test('no available later binding records cooldown but fails closed', () => {
  const plan = planWithThreeBindings();
  const state = createRoleBindingFailoverState(plan, askPolicy);

  const transition = recordActiveBindingFailure(state, plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 10_000,
    availabilityByBinding: { opus: false, gpt: false, gemini: false },
  });

  assert.equal(transition.status, 'NO_FALLBACK_AVAILABLE');
  assert.equal(transition.state.activeBindingId, 'opus');
  assert.equal(transition.state.cooldowns.length, 1);
});

test('state is plan-bound hashable and authority-neutral', () => {
  const plan = planWithThreeBindings();
  const state = createRoleBindingFailoverState(plan, askPolicy);

  assert.match(state.stateHash, /^[a-f0-9]{64}$/);
  assert.equal(state.authority, 'NONE');
  assert.equal(quotaAwareFailoverCanGrantAuthority(), false);
  assert.doesNotThrow(() => validateRoleBindingFailoverState(state, plan));

  assert.throws(
    () => validateRoleBindingFailoverState({ ...state, activeBindingId: 'gemini' }, plan),
    /hash mismatch/,
  );
});

test('invalid reset timing and policy fail closed', () => {
  const plan = planWithThreeBindings();
  assert.throws(
    () =>
      createRoleBindingFailoverState(plan, {
        returnPolicy: 'AUTO_RETURN',
        unknownResetRecheckMs: 0,
      }),
    /unknownResetRecheckMs/,
  );

  const state = createRoleBindingFailoverState(plan, askPolicy);
  assert.throws(
    () =>
      recordActiveBindingFailure(state, plan, {
        failureKind: 'quota_exhausted',
        scope: 'BINDING',
        observedAt: '2026-09-25T18:00:00.000Z',
        resetAt: '2026-09-25T17:59:59.000Z',
        availabilityByBinding: { opus: false, gpt: true, gemini: true },
      }),
    /resetAt cannot be before/,
  );
});

test('failover telemetry snapshot exposes preferred active recovery state without authority', () => {
  const plan = planWithThreeBindings();
  let state = recordActiveBindingFailure(createRoleBindingFailoverState(plan, askPolicy), plan, {
    failureKind: 'quota_exhausted',
    scope: 'BINDING',
    observedAt: '2026-09-25T18:00:00.000Z',
    retryAfterMs: 60_000,
    availabilityByBinding: { opus: false, gpt: true, gemini: true },
  }).state;

  const fallback = buildRoleBindingFailoverTelemetrySnapshot(state, plan);
  assert.equal(fallback.logicalRole, 'implementation');
  assert.equal(fallback.preferredBindingId, 'opus');
  assert.equal(fallback.preferredModel, 'opus-5.5');
  assert.equal(fallback.activeBindingId, 'gpt');
  assert.equal(fallback.activeModel, 'gpt-6');
  assert.equal(fallback.activeProviderId, 'openai');
  assert.equal(fallback.failureKind, 'quota_exhausted');
  assert.equal(fallback.recoveryState, 'WAITING_FOR_RECOVERY');
  assert.equal(fallback.nextCheckAt, '2026-09-25T18:01:00.000Z');
  assert.equal(fallback.returnPolicy, 'ASK_BEFORE_RETURN');
  assert.equal(fallback.authority, 'NONE');

  state = recordBindingRecoveryObservation(state, plan, {
    bindingId: 'opus',
    observedAt: '2026-09-25T18:01:01.000Z',
    available: true,
  });

  const recovered = buildRoleBindingFailoverTelemetrySnapshot(state, plan);
  assert.equal(recovered.recoveryState, 'APPROVAL_REQUIRED');
  assert.equal(recovered.failureKind, undefined);
  assert.equal(recovered.nextCheckAt, undefined);
  assert.match(recovered.stateHash, /^[a-f0-9]{64}$/);
});
