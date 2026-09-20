import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  dataPolicyCanAllowSecretRemoteEgress,
  dataPolicyCanGrantAuthority,
  evaluateProviderEgress,
  evaluateRawCapture,
  parseDataPolicyYaml,
  sanitizeForPersistence,
  validateDataPolicy,
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const canonicalSource = fs.readFileSync(path.join(root, '.freehighlander', 'data-policy.yaml'), 'utf8');
const policy = parseDataPolicyYaml(canonicalSource);

test('canonical data policy validates and cannot grant authority', () => {
  const validation = validateDataPolicy(policy);
  assert.equal(validation.valid, true);
  assert.equal(dataPolicyCanGrantAuthority(), false);
  assert.equal(dataPolicyCanAllowSecretRemoteEgress(), false);
});

test('provider egress is fail-closed by classification', () => {
  assert.equal(
    evaluateProviderEgress(policy, { classification: 'PUBLIC', remote: true }).allowed,
    true,
  );

  assert.equal(
    evaluateProviderEgress(policy, { classification: 'INTERNAL', remote: true }).allowed,
    false,
  );
  assert.equal(
    evaluateProviderEgress(policy, {
      classification: 'INTERNAL',
      remote: true,
      policyApproved: true,
    }).allowed,
    true,
  );

  assert.equal(
    evaluateProviderEgress(policy, {
      classification: 'CONFIDENTIAL',
      remote: true,
      providerBindingApproved: true,
    }).allowed,
    false,
  );
  assert.equal(
    evaluateProviderEgress(policy, {
      classification: 'CONFIDENTIAL',
      remote: true,
      providerBindingApproved: true,
      policyApproved: true,
    }).allowed,
    true,
  );

  const secret = evaluateProviderEgress(policy, {
    classification: 'SECRET',
    remote: true,
    policyApproved: true,
    providerBindingApproved: true,
  });
  assert.equal(secret.allowed, false);
  assert.match(secret.reason, /must never be sent/);
});

test('persistence sanitization redacts structured and inline secrets', () => {
  const sanitized = sanitizeForPersistence(policy, {
    apiKey: 'example-key',
    nested: {
      password: 'example-password',
      message: 'Authorization: Bearer abc.def.ghi',
      connection: 'password=database-password; host=localhost',
    },
    safe: 'visible',
  });

  assert.deepEqual(sanitized, {
    apiKey: '[REDACTED]',
    nested: {
      password: '[REDACTED]',
      message: 'Authorization: Bearer [REDACTED]',
      connection: 'password=[REDACTED]; host=localhost',
    },
    safe: 'visible',
  });
});

test('raw prompt/response capture requires opt-in and denies SECRET', () => {
  const defaultDecision = evaluateRawCapture(policy, {
    classification: 'INTERNAL',
    explicitOptIn: false,
  });
  assert.equal(defaultDecision.allowed, false);

  const optedIn = evaluateRawCapture(policy, {
    classification: 'INTERNAL',
    explicitOptIn: true,
  });
  assert.equal(optedIn.allowed, true);
  assert.equal(optedIn.retentionClass, 'SHORT');

  const secret = evaluateRawCapture(policy, {
    classification: 'SECRET',
    explicitOptIn: true,
  });
  assert.equal(secret.allowed, false);
  assert.equal(secret.retentionClass, null);
});

test('weakened canonical invariants are rejected', () => {
  const weakened = structuredClone(policy);
  weakened.provider_egress.SECRET.remote_allowed = true;
  weakened.persistence.raw_prompt_response_default = true;

  const validation = validateDataPolicy(weakened);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /SECRET remote egress/);
  assert.match(validation.errors.join('\n'), /raw prompt\/response persistence/);
});
