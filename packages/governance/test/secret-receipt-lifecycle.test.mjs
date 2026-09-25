import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SecretReceiptScope,
  createSecretBindingV1,
  secretReceiptLifecycleCanGrantAuthority,
  secretReceiptLifecycleCanPersistSecretValues,
  secretReceiptScopeIsDrained,
} from '../dist/index.js';

function binding(handleId) {
  return createSecretBindingV1({
    profileId: 'work-laptop',
    handleId,
    resolverKind: 'LOCAL_ENV',
    storage: 'MACHINE_LOCAL',
    reference: 'OPENAI_API_KEY',
    accountProfile: null,
    portableReferenceApproved: false,
  });
}

function plan(handleId, ttlMs = 60_000) {
  return {
    handleId,
    backend: 'LOCAL_ENV',
    target: 'PROVIDER_AUTH',
    logicalRole: 'controller',
    envName: null,
    ttlMs,
    retentionClass: 'EPHEMERAL',
    persistValue: false,
    remoteModelEgress: false,
    redactLogs: true,
    authority: 'NONE',
  };
}

function receipt(receiptId, handleId, injectedAt, expiresAt) {
  return {
    receiptId,
    handleId,
    target: 'PROVIDER_AUTH',
    injectedAt,
    expiresAt,
    valuePersisted: false,
    authority: 'NONE',
  };
}

class CaptureSink {
  revoked = [];

  async inject() {
    throw new Error('not used');
  }

  async revoke(receiptId) {
    this.revoked.push(receiptId);
  }
}

class FakeRegistry {
  failures = new Set();
  calls = [];

  async revoke(secretBinding, receiptId, sink) {
    this.calls.push({ handleId: secretBinding.handleId, receiptId });
    if (this.failures.has(receiptId)) throw new Error('fixture revoke failure');
    await sink.revoke(receiptId);
  }
}

test('secret receipt scope tracks only validated value-free receipt metadata', () => {
  const scope = new SecretReceiptScope();
  const secretBinding = binding('provider.openai.api');
  const injectionPlan = plan(secretBinding.handleId);
  const injectionReceipt = receipt(
    'receipt-001',
    secretBinding.handleId,
    '2026-09-25T08:00:00.000Z',
    '2026-09-25T08:01:00.000Z',
  );

  scope.track(secretBinding, injectionPlan, injectionReceipt);

  assert.equal(scope.activeReceiptCount, 1);
  assert.deepEqual(scope.activeReceiptIds(), ['receipt-001']);
  assert.equal(scope.has('receipt-001'), true);
  assert.equal(secretReceiptScopeIsDrained(scope), false);
  assert.equal(secretReceiptLifecycleCanPersistSecretValues(), false);
  assert.equal(secretReceiptLifecycleCanGrantAuthority(), false);

  assert.throws(
    () => scope.track(secretBinding, injectionPlan, injectionReceipt),
    /duplicate tracked secret receipt id/,
  );
  assert.throws(
    () =>
      scope.track(
        secretBinding,
        plan('provider.other.api'),
        receipt(
          'receipt-002',
          'provider.other.api',
          '2026-09-25T08:00:00.000Z',
          '2026-09-25T08:01:00.000Z',
        ),
      ),
    /binding and injection plan mismatch/,
  );
});

test('cancellation revoke is best-effort and failed receipts remain retryable', async () => {
  const scope = new SecretReceiptScope();
  const sink = new CaptureSink();
  const registry = new FakeRegistry();

  for (const [receiptId, handleId] of [
    ['receipt-001', 'provider.openai.api'],
    ['receipt-002', 'provider.anthropic.api'],
  ]) {
    const secretBinding = binding(handleId);
    scope.track(
      secretBinding,
      plan(handleId),
      receipt(receiptId, handleId, '2026-09-25T08:00:00.000Z', '2026-09-25T08:01:00.000Z'),
    );
  }

  registry.failures.add('receipt-001');
  const first = await scope.revokeAll(registry, sink, 'USER_CANCEL');

  assert.equal(first.complete, false);
  assert.deepEqual(first.attemptedReceiptIds, ['receipt-001', 'receipt-002']);
  assert.deepEqual(first.revokedReceiptIds, ['receipt-002']);
  assert.deepEqual(first.failures, [
    {
      receiptId: 'receipt-001',
      handleId: 'provider.openai.api',
      failureClass: 'REVOKE_FAILED',
    },
  ]);
  assert.equal(first.activeReceiptCount, 1);
  assert.equal(first.secretValuesPresent, false);
  assert.equal(first.authority, 'NONE');
  assert.deepEqual(sink.revoked, ['receipt-002']);
  assert.equal(secretReceiptScopeIsDrained(scope), false);

  registry.failures.clear();
  const retry = await scope.revokeAll(registry, sink, 'SHUTDOWN');
  assert.equal(retry.complete, true);
  assert.deepEqual(retry.revokedReceiptIds, ['receipt-001']);
  assert.equal(retry.activeReceiptCount, 0);
  assert.equal(secretReceiptScopeIsDrained(scope), true);
});

test('expiry cleanup revokes only expired receipts and preserves live receipts', async () => {
  const scope = new SecretReceiptScope();
  const sink = new CaptureSink();
  const registry = new FakeRegistry();

  const expiredBinding = binding('provider.openai.api');
  scope.track(
    expiredBinding,
    plan(expiredBinding.handleId),
    receipt(
      'receipt-expired',
      expiredBinding.handleId,
      '2026-09-25T08:00:00.000Z',
      '2026-09-25T08:01:00.000Z',
    ),
  );

  const liveBinding = binding('provider.anthropic.api');
  scope.track(
    liveBinding,
    plan(liveBinding.handleId, 180_000),
    receipt(
      'receipt-live',
      liveBinding.handleId,
      '2026-09-25T08:00:00.000Z',
      '2026-09-25T08:03:00.000Z',
    ),
  );

  const result = await scope.revokeExpired('2026-09-25T08:01:30.000Z', registry, sink);

  assert.equal(result.reason, 'EXPIRED');
  assert.equal(result.complete, true);
  assert.deepEqual(result.attemptedReceiptIds, ['receipt-expired']);
  assert.deepEqual(result.revokedReceiptIds, ['receipt-expired']);
  assert.deepEqual(result.failures, []);
  assert.equal(result.activeReceiptCount, 1);
  assert.deepEqual(scope.activeReceiptIds(), ['receipt-live']);
  assert.equal(secretReceiptScopeIsDrained(scope), false);
});

test('receipt lifecycle output never contains binding locator or secret material', async () => {
  const scope = new SecretReceiptScope();
  const sink = new CaptureSink();
  const registry = new FakeRegistry();
  const secretBinding = binding('provider.openai.api');

  scope.track(
    secretBinding,
    plan(secretBinding.handleId),
    receipt(
      'receipt-redaction',
      secretBinding.handleId,
      '2026-09-25T08:00:00.000Z',
      '2026-09-25T08:01:00.000Z',
    ),
  );

  const summary = await scope.revokeAll(registry, sink, 'COMPLETED');
  const serialized = JSON.stringify(summary);

  assert.doesNotMatch(serialized, /OPENAI_API_KEY|runtime-only-material/);
  assert.equal(summary.secretValuesPresent, false);
});
