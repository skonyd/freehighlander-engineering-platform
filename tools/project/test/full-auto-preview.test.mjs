import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  resolveBindingPlan,
} from '../../../packages/model-runtime/dist/index.js';
import { buildFullAutoConfigurationPreview } from '../lib/full-auto-preview.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function provider(id) {
  return {
    id,
    capabilities() {
      return new Set();
    },
    async health() {
      return { available: true };
    },
    async invoke(request) {
      return { output: 'ok', model: request.model };
    },
  };
}

function publication({
  logicalRole,
  riskTier = 'NORMAL',
  primaryId,
  primaryProvider,
  primaryModel,
  primaryGroup,
  primaryEffort = 'medium',
  fallback,
  publicationHash,
}) {
  const providers = new ProviderRegistry();
  const registry = new BindingRegistry();

  const primary = {
    id: primaryId,
    version: '1.0.0',
    providerId: primaryProvider,
    model: primaryModel,
    effort: primaryEffort,
    allowedRiskTiers: [riskTier],
    independenceGroup: primaryGroup,
  };
  providers.register(provider(primaryProvider));
  registry.register(primary);

  const fallbacks = [];
  if (fallback !== undefined) {
    if (!providers.has(fallback.providerId)) providers.register(provider(fallback.providerId));
    const definition = {
      id: fallback.id,
      version: '1.0.0',
      providerId: fallback.providerId,
      model: fallback.model,
      effort: fallback.effort ?? 'low',
      allowedRiskTiers: [riskTier],
      independenceGroup: fallback.independenceGroup,
    };
    registry.register(definition);
    fallbacks.push(definition);
  }

  const plan = resolveBindingPlan(providers, registry, {
    logicalRole,
    riskTier,
    primaryBindingId: primary.id,
    ...(fallbacks.length > 0 ? { fallbackBindingIds: fallbacks.map((item) => item.id) } : {}),
  });

  return {
    schemaVersion: 1,
    logicalRole,
    riskTier,
    publishedAt: '2026-09-25T17:00:00.000Z',
    primary,
    fallbacks,
    plan,
    hash: publicationHash,
    authority: 'NONE',
  };
}

function readyState(overrides = {}) {
  const reviewerA = publication({
    logicalRole: 'autonomous-merge-reviewer-a',
    primaryId: 'a-primary',
    primaryProvider: 'provider-a',
    primaryModel: 'model-a',
    primaryGroup: 'group-a',
    fallback: {
      id: 'a-fallback',
      providerId: 'provider-c',
      model: 'model-c',
      independenceGroup: 'group-c',
    },
    publicationHash: HASH_A,
  });
  const reviewerB = publication({
    logicalRole: 'autonomous-merge-reviewer-b',
    primaryId: 'b-primary',
    primaryProvider: 'provider-b',
    primaryModel: 'model-b',
    primaryGroup: 'group-b',
    primaryEffort: 'low',
    publicationHash: HASH_B,
  });

  return {
    publications: [reviewerA, reviewerB],
    ...overrides,
  };
}

test('Full Auto preview reports a valid dynamic reviewer configuration without execution authority', () => {
  const preview = buildFullAutoConfigurationPreview(readyState(), {
    profile: 'BALANCED',
    riskTier: 'NORMAL',
    producerIndependenceGroup: 'producer',
    maxDebateRounds: 2,
  });

  assert.equal(preview.configurationStatus, 'READY_FOR_SHADOW_REVIEW');
  assert.deepEqual(preview.blockingReasons, []);
  assert.equal(preview.riskDelegated, true);
  assert.equal(preview.reviewerA.primary.model, 'model-a');
  assert.equal(preview.reviewerA.primary.effort, 'medium');
  assert.equal(preview.reviewerB.primary.model, 'model-b');
  assert.equal(preview.reviewerB.primary.effort, 'low');
  assert.equal(preview.independence.valid, true);
  assert.match(preview.bindingSnapshot.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(preview.policyBoundary.humanRequiredDelegable, false);
  assert.equal(preview.policyBoundary.denyOverridable, false);
  assert.equal(preview.authority.v3, 'SHADOW_ONLY');
  assert.equal(preview.authority.executionAuthorized, false);
  assert.equal(preview.runPreview.wouldAutonomouslyMergeNow, false);
  assert.equal(preview.runPreview.reason, 'NO_CURRENT_RUN_EVIDENCE');
});

test('Full Auto OFF is explicit and blocks autonomous review readiness', () => {
  const preview = buildFullAutoConfigurationPreview(readyState(), {
    profile: 'OFF',
    riskTier: 'NORMAL',
    producerIndependenceGroup: 'producer',
  });

  assert.equal(preview.configurationStatus, 'BLOCKED');
  assert.deepEqual(preview.blockingReasons, ['PROFILE_OFF']);
  assert.equal(preview.riskDelegated, false);
  assert.equal(preview.runPreview.reason, 'CONFIGURATION_BLOCKED');
});

test('SAFE and CUSTOM profiles expose deterministic risk eligibility', () => {
  const safe = buildFullAutoConfigurationPreview(readyState(), {
    profile: 'SAFE',
    riskTier: 'HIGH',
    producerIndependenceGroup: 'producer',
  });
  assert.equal(safe.configurationStatus, 'BLOCKED');
  assert.equal(safe.blockingReasons.includes('RISK_NOT_DELEGATED'), true);

  const customState = {
    publications: readyState().publications.map((item) => ({
      ...item,
      riskTier: 'HIGH',
      primary: { ...item.primary, allowedRiskTiers: ['HIGH'] },
      fallbacks: item.fallbacks.map((binding) => ({
        ...binding,
        allowedRiskTiers: ['HIGH'],
      })),
      plan: { ...item.plan, riskTier: 'HIGH' },
    })),
  };
  assert.throws(
    () =>
      buildFullAutoConfigurationPreview(customState, {
        profile: 'CUSTOM',
        riskTier: 'HIGH',
        producerIndependenceGroup: 'producer',
      }),
    /requires at least one allowed risk tier/,
  );
});

test('missing reviewer publication is surfaced as a configuration blocker', () => {
  const state = readyState();
  const preview = buildFullAutoConfigurationPreview(
    { publications: [state.publications[0]] },
    {
      profile: 'BALANCED',
      riskTier: 'NORMAL',
      producerIndependenceGroup: 'producer',
    },
  );

  assert.equal(preview.configurationStatus, 'BLOCKED');
  assert.equal(preview.blockingReasons.includes('REVIEWER_B_BINDING_MISSING'), true);
  assert.equal(preview.reviewerB.configured, false);
  assert.equal(preview.independence.valid, false);
});

test('same reviewer role and independence conflicts fail closed', () => {
  const state = readyState();
  const sameRole = buildFullAutoConfigurationPreview(state, {
    profile: 'BALANCED',
    riskTier: 'NORMAL',
    reviewerARole: 'autonomous-merge-reviewer-a',
    reviewerBRole: 'autonomous-merge-reviewer-a',
    producerIndependenceGroup: 'producer',
  });
  assert.equal(sameRole.blockingReasons.includes('REVIEWER_ROLES_NOT_DISTINCT'), true);

  const conflictB = publication({
    logicalRole: 'autonomous-merge-reviewer-b',
    primaryId: 'b-conflict',
    primaryProvider: 'provider-b',
    primaryModel: 'model-b',
    primaryGroup: 'group-a',
    publicationHash: HASH_B,
  });
  const conflict = buildFullAutoConfigurationPreview(
    { publications: [state.publications[0], conflictB] },
    {
      profile: 'BALANCED',
      riskTier: 'NORMAL',
      producerIndependenceGroup: 'producer',
    },
  );
  assert.equal(conflict.configurationStatus, 'BLOCKED');
  assert.equal(conflict.blockingReasons.includes('INDEPENDENCE_INVALID'), true);
  assert.equal(conflict.independence.valid, false);
});

test('producer independence group and max debate rounds are required and bounded', () => {
  assert.throws(
    () =>
      buildFullAutoConfigurationPreview(readyState(), {
        profile: 'BALANCED',
        riskTier: 'NORMAL',
      }),
    /producerIndependenceGroup is required/,
  );
  assert.throws(
    () =>
      buildFullAutoConfigurationPreview(readyState(), {
        profile: 'BALANCED',
        riskTier: 'NORMAL',
        producerIndependenceGroup: 'producer',
        maxDebateRounds: 0,
      }),
    /maxDebateRounds/,
  );
});
