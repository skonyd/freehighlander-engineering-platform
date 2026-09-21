import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseDataPolicyYaml,
  prepareProviderEgress,
  providerEgressPreparationCanGrantAuthority,
  providerEgressPreparationCanInvokeProvider,
  validateProviderEgressPreparationRequest,
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const policy = parseDataPolicyYaml(
  fs.readFileSync(path.join(root, '.freehighlander', 'data-policy.yaml'), 'utf8'),
);

function request(overrides = {}) {
  return {
    packetId: 'packet-001',
    providerId: 'provider-primary',
    classification: 'PUBLIC',
    remote: true,
    payload: {
      safe: 'visible',
      authorization: 'Bearer raw-secret-token',
      nested: {
        apiKey: 'raw-api-key',
      },
    },
    ...overrides,
  };
}

test('allowed remote preparation redacts before producing a candidate packet', () => {
  const result = prepareProviderEgress(policy, request());

  assert.equal(result.decision.allowed, true);
  assert.equal(result.invocationAuthorized, false);
  assert.equal(result.authority, 'NONE');
  assert.equal(result.packet?.redactionApplied, true);
  assert.deepEqual(result.packet?.sanitizedPayload, {
    safe: 'visible',
    authorization: '[REDACTED]',
    nested: {
      apiKey: '[REDACTED]',
    },
  });
  assert.match(result.packet?.contentHash ?? '', /^[a-f0-9]{64}$/);
  assert.deepEqual(result.telemetryPayload, {
    category: 'provider-egress',
    action: 'prepare',
    outcome: 'ALLOW',
    reasonCode: 'PUBLIC_REMOTE_ALLOWED',
    subjectId: 'packet-001',
    resourceId: 'provider-primary',
    contentHash: result.packet?.contentHash,
  });
});

test('sanitized content hash is deterministic under object key reordering', () => {
  const first = prepareProviderEgress(
    policy,
    request({
      payload: {
        b: 'value',
        a: { authorization: 'Bearer secret' },
      },
    }),
  );
  const second = prepareProviderEgress(
    policy,
    request({
      payload: {
        a: { authorization: 'Bearer secret' },
        b: 'value',
      },
    }),
  );

  assert.equal(first.packet?.contentHash, second.packet?.contentHash);
  assert.deepEqual(first.packet?.sanitizedPayload, second.packet?.sanitizedPayload);
});

test('INTERNAL and CONFIDENTIAL remote egress fail closed until policy/binding requirements pass', () => {
  const internalDenied = prepareProviderEgress(
    policy,
    request({ classification: 'INTERNAL' }),
  );
  assert.equal(internalDenied.decision.allowed, false);
  assert.equal(internalDenied.packet, null);
  assert.equal(internalDenied.telemetryPayload.reasonCode, 'INTERNAL_POLICY_REQUIRED');

  const internalAllowed = prepareProviderEgress(
    policy,
    request({ classification: 'INTERNAL', policyApproved: true }),
  );
  assert.equal(internalAllowed.decision.allowed, true);

  const confidentialDenied = prepareProviderEgress(
    policy,
    request({
      classification: 'CONFIDENTIAL',
      policyApproved: true,
      providerBindingApproved: false,
    }),
  );
  assert.equal(confidentialDenied.decision.allowed, false);
  assert.equal(confidentialDenied.packet, null);
  assert.equal(
    confidentialDenied.telemetryPayload.reasonCode,
    'CONFIDENTIAL_POLICY_BINDING_REQUIRED',
  );

  const confidentialAllowed = prepareProviderEgress(
    policy,
    request({
      classification: 'CONFIDENTIAL',
      policyApproved: true,
      providerBindingApproved: true,
      providerBindingId: 'binding-approved-001',
    }),
  );
  assert.equal(confidentialAllowed.decision.allowed, true);
  assert.equal(confidentialAllowed.packet?.providerBindingId, 'binding-approved-001');
  assert.equal(
    confidentialAllowed.telemetryPayload.reasonCode,
    'CONFIDENTIAL_POLICY_BINDING_APPROVED',
  );
});

test('SECRET remote egress never produces an invocation payload', () => {
  const result = prepareProviderEgress(
    policy,
    request({
      classification: 'SECRET',
      policyApproved: true,
      providerBindingApproved: true,
      providerBindingId: 'binding-approved-001',
    }),
  );

  assert.equal(result.decision.allowed, false);
  assert.equal(result.packet, null);
  assert.equal(result.telemetryPayload.outcome, 'DENY');
  assert.equal(result.telemetryPayload.reasonCode, 'SECRET_REMOTE_FORBIDDEN');
  assert.equal('contentHash' in result.telemetryPayload, false);
});

test('local processing is allowed but preparation still grants no invocation authority', () => {
  const result = prepareProviderEgress(
    policy,
    request({
      classification: 'CONFIDENTIAL',
      remote: false,
    }),
  );

  assert.equal(result.decision.allowed, true);
  assert.equal(result.telemetryPayload.reasonCode, 'LOCAL_PROCESSING_ALLOWED');
  assert.equal(result.invocationAuthorized, false);
  assert.equal(providerEgressPreparationCanInvokeProvider(), false);
  assert.equal(providerEgressPreparationCanGrantAuthority(), false);
});

test('approved provider binding requires explicit binding identity', () => {
  const invalid = request({
    classification: 'CONFIDENTIAL',
    policyApproved: true,
    providerBindingApproved: true,
  });
  assert.equal(validateProviderEgressPreparationRequest(invalid).valid, false);
  assert.throws(
    () => prepareProviderEgress(policy, invalid),
    /approved provider binding requires an explicit bounded providerBindingId/,
  );
});

test('malformed identifiers and non-JSON payloads fail before policy preparation', () => {
  for (const invalid of [
    request({ packetId: 'x' }),
    request({ providerId: 'x' }),
    request({ payload: { value: Number.NaN } }),
    request({ payload: { value: undefined } }),
    request({ payload: new Date('2026-09-21T12:00:00Z') }),
  ]) {
    assert.equal(validateProviderEgressPreparationRequest(invalid).valid, false);
    assert.throws(() => prepareProviderEgress(policy, invalid), /invalid provider egress/);
  }

  const circular = {};
  circular.self = circular;
  const circularRequest = request({ payload: circular });
  assert.equal(validateProviderEgressPreparationRequest(circularRequest).valid, false);
  assert.throws(() => prepareProviderEgress(policy, circularRequest), /circular references/);
});
