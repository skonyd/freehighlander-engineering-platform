import assert from 'node:assert/strict';
import test from 'node:test';

import { transitionRuntimeDrain } from '../../../apps/control-plane/dist/index.js';
import {
  SecretReceiptScope,
  createSecretBindingV1,
  secretReceiptScopeIsDrained,
} from '../../../packages/governance/dist/index.js';

test('graceful drain cannot STOP until tracked secret receipts are revoked', async () => {
  const scope = new SecretReceiptScope();
  const binding = createSecretBindingV1({
    profileId: 'work-laptop',
    handleId: 'provider.openai.api',
    resolverKind: 'LOCAL_ENV',
    storage: 'MACHINE_LOCAL',
    reference: 'OPENAI_API_KEY',
    accountProfile: null,
    portableReferenceApproved: false,
  });
  const plan = {
    handleId: binding.handleId,
    backend: 'LOCAL_ENV',
    target: 'PROVIDER_AUTH',
    logicalRole: 'controller',
    envName: null,
    ttlMs: 60_000,
    retentionClass: 'EPHEMERAL',
    persistValue: false,
    remoteModelEgress: false,
    redactLogs: true,
    authority: 'NONE',
  };
  const receipt = {
    receiptId: 'receipt-drain-001',
    handleId: binding.handleId,
    target: 'PROVIDER_AUTH',
    injectedAt: '2026-09-25T08:00:00.000Z',
    expiresAt: '2026-09-25T08:01:00.000Z',
    valuePersisted: false,
    authority: 'NONE',
  };
  scope.track(binding, plan, receipt);

  const baseEvidence = {
    acceptingNewWork: false,
    safeCheckpointPersisted: true,
    activitiesSettled: true,
    permitsReleased: true,
    leasesReleased: true,
  };

  assert.throws(
    () =>
      transitionRuntimeDrain('RELEASING', 'STOPPED', {
        ...baseEvidence,
        secretReceiptsRevoked: secretReceiptScopeIsDrained(scope),
      }),
    /all runtime resources are released/,
  );

  const revoked = [];
  const registry = {
    async revoke(_binding, receiptId, sink) {
      await sink.revoke(receiptId);
    },
  };
  const sink = {
    async inject() {
      throw new Error('not used');
    },
    async revoke(receiptId) {
      revoked.push(receiptId);
    },
  };

  const release = await scope.revokeAll(registry, sink, 'SHUTDOWN');
  assert.equal(release.complete, true);
  assert.deepEqual(revoked, ['receipt-drain-001']);
  assert.equal(secretReceiptScopeIsDrained(scope), true);

  const stopped = transitionRuntimeDrain('RELEASING', 'STOPPED', {
    ...baseEvidence,
    secretReceiptsRevoked: secretReceiptScopeIsDrained(scope),
  });
  assert.deepEqual(stopped, { from: 'RELEASING', to: 'STOPPED', authority: 'NONE' });
});
