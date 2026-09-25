import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BindingRegistry,
  ProviderRegistry,
  buildFullAutoReviewerBindingSnapshot,
  fullAutoReviewerBindingSnapshotCanGrantAuthority,
  fullAutoReviewerFallbackMayBreakIndependence,
  resolveBindingPlan,
  validateFullAutoReviewerBindingSnapshot,
} from '../dist/index.js';

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

function setup() {
  const providers = new ProviderRegistry();
  providers.register(provider('p-a'));
  providers.register(provider('p-b'));
  providers.register(provider('p-c'));

  const bindings = new BindingRegistry();
  for (const binding of [
    {
      id: 'a-primary',
      version: '1.0.0',
      providerId: 'p-a',
      model: 'model-a',
      effort: 'medium',
      allowedRiskTiers: ['NORMAL', 'HIGH'],
      independenceGroup: 'group-a',
    },
    {
      id: 'a-fallback',
      version: '1.0.0',
      providerId: 'p-c',
      model: 'model-c',
      effort: 'medium',
      allowedRiskTiers: ['NORMAL', 'HIGH'],
      independenceGroup: 'group-c',
    },
    {
      id: 'b-primary',
      version: '1.0.0',
      providerId: 'p-b',
      model: 'model-b',
      effort: 'low',
      allowedRiskTiers: ['NORMAL', 'HIGH'],
      independenceGroup: 'group-b',
    },
    {
      id: 'b-conflict',
      version: '1.0.0',
      providerId: 'p-a',
      model: 'model-a2',
      effort: 'low',
      allowedRiskTiers: ['NORMAL', 'HIGH'],
      independenceGroup: 'group-a',
    },
    {
      id: 'producer-conflict',
      version: '1.0.0',
      providerId: 'p-c',
      model: 'model-producer',
      effort: 'medium',
      allowedRiskTiers: ['NORMAL'],
      independenceGroup: 'producer',
    },
  ]) {
    bindings.register(binding);
  }

  return { providers, bindings };
}

function plan(
  providers,
  bindings,
  logicalRole,
  primaryBindingId,
  fallbackBindingIds = [],
  riskTier = 'NORMAL',
) {
  return resolveBindingPlan(providers, bindings, {
    logicalRole,
    riskTier,
    primaryBindingId,
    fallbackBindingIds,
  });
}

test('Full Auto reviewer snapshot binds exact plans and preserves fallback independence', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'autonomous-merge-reviewer-a', 'a-primary', [
    'a-fallback',
  ]);
  const reviewerB = plan(providers, bindings, 'autonomous-merge-reviewer-b', 'b-primary');

  const first = buildFullAutoReviewerBindingSnapshot({
    reviewerA,
    reviewerB,
    producerIndependenceGroup: 'producer',
  });
  const second = buildFullAutoReviewerBindingSnapshot({
    reviewerA,
    reviewerB,
    producerIndependenceGroup: 'producer',
  });

  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.deepEqual(first.reviewerAIndependenceGroups, ['group-a', 'group-c']);
  assert.deepEqual(first.reviewerBIndependenceGroups, ['group-b']);
  assert.equal(first.reviewerAPlanHash, reviewerA.hash);
  assert.equal(first.reviewerBPlanHash, reviewerB.hash);
  assert.equal(first.authority, 'NONE');
  assert.equal(fullAutoReviewerBindingSnapshotCanGrantAuthority(), false);
  assert.equal(fullAutoReviewerFallbackMayBreakIndependence(), false);
  assert.doesNotThrow(() =>
    validateFullAutoReviewerBindingSnapshot(first, {
      reviewerA,
      reviewerB,
      producerIndependenceGroup: 'producer',
    }),
  );
});

test('reviewer logical roles must differ', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'same-role', 'a-primary');
  const reviewerB = plan(providers, bindings, 'same-role', 'b-primary');

  assert.throws(
    () =>
      buildFullAutoReviewerBindingSnapshot({
        reviewerA,
        reviewerB,
        producerIndependenceGroup: 'producer',
      }),
    /distinct logical roles/,
  );
});

test('reviewer plans must target the same risk tier', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'reviewer-a', 'a-primary', [], 'NORMAL');
  const reviewerB = plan(providers, bindings, 'reviewer-b', 'b-primary', [], 'HIGH');

  assert.throws(
    () =>
      buildFullAutoReviewerBindingSnapshot({
        reviewerA,
        reviewerB,
        producerIndependenceGroup: 'producer',
      }),
    /same risk tier/,
  );
});

test('every fallback path must preserve reviewer-to-reviewer independence', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'reviewer-a', 'a-primary', ['a-fallback']);
  const reviewerB = plan(providers, bindings, 'reviewer-b', 'b-primary', ['b-conflict']);

  assert.throws(
    () =>
      buildFullAutoReviewerBindingSnapshot({
        reviewerA,
        reviewerB,
        producerIndependenceGroup: 'producer',
      }),
    /fallback independence is not preserved for group group-a/,
  );
});

test('every reviewer primary or fallback binding must remain independent from producer', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'reviewer-a', 'a-primary', ['producer-conflict']);
  const reviewerB = plan(providers, bindings, 'reviewer-b', 'b-primary');

  assert.throws(
    () =>
      buildFullAutoReviewerBindingSnapshot({
        reviewerA,
        reviewerB,
        producerIndependenceGroup: 'producer',
      }),
    /reviewer A fallback plan conflicts with producer/,
  );
});

test('binding-plan change creates a new Full Auto reviewer snapshot identity', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'reviewer-a', 'a-primary');
  const reviewerAWithFallback = plan(providers, bindings, 'reviewer-a', 'a-primary', [
    'a-fallback',
  ]);
  const reviewerB = plan(providers, bindings, 'reviewer-b', 'b-primary');

  const first = buildFullAutoReviewerBindingSnapshot({
    reviewerA,
    reviewerB,
    producerIndependenceGroup: 'producer',
  });
  const changed = buildFullAutoReviewerBindingSnapshot({
    reviewerA: reviewerAWithFallback,
    reviewerB,
    producerIndependenceGroup: 'producer',
  });

  assert.notEqual(first.reviewerAPlanHash, changed.reviewerAPlanHash);
  assert.notEqual(first.snapshotHash, changed.snapshotHash);
});

test('tampered Full Auto reviewer snapshot is rejected', () => {
  const { providers, bindings } = setup();
  const reviewerA = plan(providers, bindings, 'reviewer-a', 'a-primary');
  const reviewerB = plan(providers, bindings, 'reviewer-b', 'b-primary');
  const snapshot = buildFullAutoReviewerBindingSnapshot({
    reviewerA,
    reviewerB,
    producerIndependenceGroup: 'producer',
  });

  assert.throws(
    () =>
      validateFullAutoReviewerBindingSnapshot(
        { ...snapshot, reviewerAPlanHash: '0'.repeat(64) },
        { reviewerA, reviewerB, producerIndependenceGroup: 'producer' },
      ),
    /identity mismatch/,
  );

  assert.throws(
    () =>
      validateFullAutoReviewerBindingSnapshot(
        { ...snapshot, snapshotHash: '0'.repeat(64) },
        { reviewerA, reviewerB, producerIndependenceGroup: 'producer' },
      ),
    /hash mismatch/,
  );
});
