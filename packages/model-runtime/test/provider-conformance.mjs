import assert from 'node:assert/strict';

async function withHarness(factory, callback) {
  const harness = await factory();
  try {
    return await callback(harness);
  } finally {
    await harness.close?.();
  }
}

async function expectFailureKind(factory, expectedKind) {
  await withHarness(factory, async ({ adapter }) => {
    await assert.rejects(
      () =>
        adapter.invoke({
          logicalRole: 'conformance-review',
          input: 'probe',
          model: 'conformance-model',
          timeoutMs: 250,
        }),
      (error) => error instanceof Error && error.kind === expectedKind,
    );
  });
}

export async function runProviderAdapterConformance(t, profile) {
  await t.test('health success and declared capability consistency', async () => {
    await withHarness(profile.healthy, async ({ adapter }) => {
      const health = await adapter.health();
      assert.equal(health.available, true);

      const capabilities = adapter.capabilities();
      assert.equal(capabilities instanceof Set, true);
      assert.deepEqual([...capabilities].sort(), [...profile.expectedCapabilities].sort());

      if (capabilities.has('token_counting')) {
        assert.equal(typeof adapter.countInputTokens, 'function');
      }
      if (typeof adapter.countInputTokens === 'function') {
        assert.equal(capabilities.has('token_counting'), true);
      }

      if (capabilities.has('cancellation')) {
        assert.equal(typeof adapter.cancel, 'function');
      }
      if (typeof adapter.cancel === 'function') {
        assert.equal(capabilities.has('cancellation'), true);
      }

      if (capabilities.has('reasoning_effort')) {
        assert.equal(typeof profile.assertEffortMapping, 'function');
        await profile.assertEffortMapping(adapter);
      } else {
        assert.equal(profile.assertEffortMapping, undefined);
      }

      if (typeof adapter.discoverModels === 'function') {
        assert.equal(typeof profile.assertModelDiscovery, 'function');
      } else {
        assert.equal(profile.assertModelDiscovery, undefined);
      }
    });
  });

  await t.test('health failure is observable without invocation', async () => {
    await withHarness(profile.unhealthy, async ({ adapter }) => {
      const health = await adapter.health();
      assert.equal(health.available, false);
      assert.equal(typeof health.detail, 'string');
      assert.ok(health.detail.length > 0);
    });
  });

  await t.test('successful invocation maps output model and usage', async () => {
    await withHarness(profile.success, async ({ adapter }) => {
      const result = await adapter.invoke({
        logicalRole: 'conformance-review',
        input: 'probe',
        model: 'conformance-model',
        timeoutMs: 2_000,
      });

      assert.equal(result.output, profile.expectedSuccess.output);
      assert.equal(result.model, profile.expectedSuccess.model);
      assert.deepEqual(result.usage, profile.expectedSuccess.usage);
    });
  });

  await t.test('timeout is classified as transport_failure', async () => {
    await expectFailureKind(profile.timeout, 'transport_failure');
  });

  await t.test('authentication failure is classified as auth_unavailable', async () => {
    await expectFailureKind(profile.authFailure, 'auth_unavailable');
  });

  await t.test('quota exhaustion is classified separately from rate limiting', async () => {
    await expectFailureKind(profile.quotaFailure, 'quota_exhausted');
    await expectFailureKind(profile.rateLimitFailure, 'rate_limited');
  });

  await t.test('provider 5xx failure is classified as provider_unavailable', async () => {
    await expectFailureKind(profile.providerFailure, 'provider_unavailable');
  });

  await t.test('transport failure is classified independently from provider response', async () => {
    await expectFailureKind(profile.transportFailure, 'transport_failure');
  });

  await t.test('malformed provider response is classified as malformed_output', async () => {
    await expectFailureKind(profile.malformedFailure, 'malformed_output');
  });

  await t.test(
    'optional adapter features run conformance hooks only when implemented',
    async () => {
      await withHarness(profile.healthy, async ({ adapter }) => {
        const capabilities = adapter.capabilities();

        if (capabilities.has('cancellation')) {
          assert.equal(typeof profile.assertCancellation, 'function');
          await profile.assertCancellation(adapter);
        } else {
          assert.equal(profile.assertCancellation, undefined);
        }

        if (typeof adapter.discoverModels === 'function') {
          await profile.assertModelDiscovery(adapter);
        }
      });
    },
  );
}
