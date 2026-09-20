import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSecretAccess,
  planSecretInjection,
  promptCanRequestRawSecretValue,
  secretBrokerCanGrantAuthority,
  secretValueCanBePersisted,
  secretValueCanReachRemoteModel,
  validateSecretHandle,
  validateSecretInjectionReceipt,
} from '../dist/index.js';

const handle = {
  id: 'provider-auth-primary',
  backend: 'OS_KEYCHAIN',
  classification: 'SECRET',
};

const sandboxAllow = {
  allowed: true,
  reason: 'role/workflow allowed SECRET_ACCESS',
  authority: 'NONE',
};

function request(overrides = {}) {
  return {
    handle,
    logicalRole: 'provider-invoker',
    target: 'PROVIDER_AUTH',
    roleAllows: true,
    workflowAllows: true,
    sandboxDecision: sandboxAllow,
    ttlMs: 60_000,
    ...overrides,
  };
}

test('opaque handle and authority-neutral ephemeral provider-auth plan are accepted', () => {
  assert.deepEqual(validateSecretHandle(handle), { valid: true, errors: [] });

  const result = planSecretInjection(request());
  assert.equal(result.decision.allowed, true);
  assert.equal(result.decision.authority, 'NONE');
  assert.equal(result.decision.valuePersistence, 'FORBIDDEN');
  assert.equal(result.decision.remoteModelEgress, 'FORBIDDEN');

  assert.deepEqual(result.plan, {
    handleId: 'provider-auth-primary',
    backend: 'OS_KEYCHAIN',
    target: 'PROVIDER_AUTH',
    logicalRole: 'provider-invoker',
    envName: null,
    ttlMs: 60_000,
    retentionClass: 'EPHEMERAL',
    persistValue: false,
    remoteModelEgress: false,
    redactLogs: true,
    authority: 'NONE',
  });

  const serialized = JSON.stringify(result.plan);
  for (const forbidden of ['"value"', '"token"', '"password"', '"locator"']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('COMMAND_ENV requires an explicit bounded environment-variable target', () => {
  assert.equal(
    planSecretInjection(request({ target: 'COMMAND_ENV', envName: 'PROVIDER_API_KEY' })).decision
      .allowed,
    true,
  );

  for (const envName of [undefined, 'lowercase', 'BAD-NAME', '1BAD']) {
    const result = planSecretInjection(request({ target: 'COMMAND_ENV', envName }));
    assert.equal(result.decision.allowed, false);
    assert.equal(result.plan, null);
  }
});

test('role workflow and sandbox form an intersection for secret access', () => {
  assert.equal(evaluateSecretAccess(request({ roleAllows: false })).allowed, false);
  assert.equal(evaluateSecretAccess(request({ workflowAllows: false })).allowed, false);
  assert.equal(
    evaluateSecretAccess(
      request({
        sandboxDecision: {
          allowed: false,
          reason: 'denied',
          authority: 'NONE',
        },
      }),
    ).allowed,
    false,
  );
});

test('persistence remote-model egress and prompt/model raw-value requests fail closed', () => {
  for (const override of [
    { persistRequested: true },
    { remoteModelEgressRequested: true },
    { promptRequestedRawValue: true },
    { modelIdentityRequestedRawValue: true },
  ]) {
    const result = planSecretInjection(request(override));
    assert.equal(result.decision.allowed, false);
    assert.equal(result.plan, null);
    assert.equal(result.decision.valuePersistence, 'FORBIDDEN');
    assert.equal(result.decision.remoteModelEgress, 'FORBIDDEN');
  }
});

test('ephemeral injection requires explicit positive TTL and target-specific metadata', () => {
  for (const ttlMs of [0, -1, 1.5, Number.NaN]) {
    assert.equal(planSecretInjection(request({ ttlMs })).decision.allowed, false);
  }

  assert.equal(
    planSecretInjection(request({ target: 'TOOL_AUTH', envName: 'SHOULD_NOT_EXIST' })).decision
      .allowed,
    false,
  );
});

test('invalid handles fail closed before injection planning', () => {
  for (const invalid of [
    { id: 'x', backend: 'OS_KEYCHAIN', classification: 'SECRET' },
    { id: 'valid-id', backend: 'UNKNOWN', classification: 'SECRET' },
    { id: 'valid-id', backend: 'OS_KEYCHAIN', classification: 'PUBLIC' },
  ]) {
    const result = planSecretInjection(request({ handle: invalid }));
    assert.equal(result.decision.allowed, false);
    assert.equal(result.plan, null);
  }
});

test('receipt validation binds handle target TTL and no-persistence evidence', () => {
  const result = planSecretInjection(request());
  assert.ok(result.plan);

  const validReceipt = {
    receiptId: 'receipt-provider-auth-primary',
    handleId: result.plan.handleId,
    target: result.plan.target,
    injectedAt: '2026-09-20T14:00:00.000Z',
    expiresAt: '2026-09-20T14:00:30.000Z',
    valuePersisted: false,
    authority: 'NONE',
  };

  assert.deepEqual(validateSecretInjectionReceipt(result.plan, validReceipt), {
    valid: true,
    errors: [],
  });

  const invalid = validateSecretInjectionReceipt(result.plan, {
    ...validReceipt,
    expiresAt: '2026-09-20T14:02:00.000Z',
  });
  assert.equal(invalid.valid, false);
  assert.equal(
    invalid.errors.includes('secret injection receipt cannot exceed the planned ttlMs'),
    true,
  );
});

test('secret broker contract cannot grant authority persist values or reach remote models', () => {
  assert.equal(secretBrokerCanGrantAuthority(), false);
  assert.equal(secretValueCanBePersisted(), false);
  assert.equal(secretValueCanReachRemoteModel(), false);
  assert.equal(promptCanRequestRawSecretValue(), false);
});
