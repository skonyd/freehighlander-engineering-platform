import assert from 'node:assert/strict';
import test from 'node:test';

import { createHardeningEvent, parseEvent, serializeEvent } from '../dist/index.js';

const hash = 'a'.repeat(64);

test('hardening telemetry remains metadata-only and round-trips deterministically', () => {
  const event = createHardeningEvent({
    type: 'provider.egress.decision',
    timestamp: '2026-09-20T12:00:00.000Z',
    runId: 'run-hardening',
    payload: {
      category: 'provider-egress',
      action: 'evaluate',
      outcome: 'DENY',
      reasonCode: 'SECRET_REMOTE_EGRESS_FORBIDDEN',
      subjectId: 'packet-1',
      policyHash: hash,
      contentHash: 'b'.repeat(64),
      itemCount: 3,
    },
  });

  const restored = parseEvent(serializeEvent(event));
  assert.equal(restored.type, 'provider.egress.decision');
  assert.equal(restored.payload.outcome, 'DENY');
  assert.equal(restored.payload.reasonCode, 'SECRET_REMOTE_EGRESS_FORBIDDEN');
  assert.equal('prompt' in restored.payload, false);
  assert.equal('completion' in restored.payload, false);
  assert.equal('secret' in restored.payload, false);
  assert.equal('token' in restored.payload, false);
});

test('hardening telemetry rejects arbitrary secret-bearing payload fields', () => {
  assert.throws(
    () =>
      createHardeningEvent({
        type: 'data.redaction',
        timestamp: '2026-09-20T12:00:00.000Z',
        runId: 'run-hardening',
        payload: {
          category: 'redaction',
          action: 'persist',
          outcome: 'PASS',
          reasonCode: 'REDACTED',
          secret: 'must-never-persist',
        },
      }),
    /field is not allowed: secret/,
  );

  assert.throws(
    () =>
      createHardeningEvent({
        type: 'policy.decision',
        timestamp: '2026-09-20T12:00:00.000Z',
        runId: 'run-hardening',
        payload: {
          category: 'policy',
          action: 'evaluate',
          outcome: 'ALLOW',
          reasonCode: 'POLICY_MATCH',
          prompt: 'raw private prompt',
        },
      }),
    /field is not allowed: prompt/,
  );
});

test('hardening telemetry validates hashes, counts and required reason metadata', () => {
  assert.throws(
    () =>
      createHardeningEvent({
        type: 'persistence.integrity.checked',
        timestamp: '2026-09-20T12:00:00.000Z',
        runId: 'run-hardening',
        payload: {
          category: 'persistence',
          action: 'integrity-check',
          outcome: 'PASS',
          reasonCode: 'SQLITE_OK',
          contentHash: 'not-a-sha256',
        },
      }),
    /contentHash must be lowercase sha256/,
  );

  assert.throws(
    () =>
      createHardeningEvent({
        type: 'retention.plan.action',
        timestamp: '2026-09-20T12:00:00.000Z',
        runId: 'run-hardening',
        payload: {
          category: 'retention',
          action: 'plan',
          outcome: 'PLANNED',
          reasonCode: 'TTL_EXPIRED',
          itemCount: -1,
        },
      }),
    /itemCount must be a non-negative integer/,
  );

  assert.throws(
    () =>
      createHardeningEvent({
        type: 'lineage.validation.failed',
        timestamp: '2026-09-20T12:00:00.000Z',
        runId: 'run-hardening',
        payload: {
          category: 'lineage',
          action: 'validate',
          outcome: 'FAIL',
          reasonCode: ' ',
        },
      }),
    /reasonCode is required/,
  );
});

test('all hardening event types accept only the bounded metadata contract', () => {
  const types = [
    'policy.decision',
    'data.redaction',
    'provider.egress.decision',
    'sandbox.decision',
    'retention.plan.action',
    'persistence.integrity.checked',
    'persistence.backup.completed',
    'persistence.restore.completed',
    'lineage.validation.failed',
  ];

  for (const type of types) {
    const event = createHardeningEvent({
      type,
      timestamp: '2026-09-20T12:00:00.000Z',
      runId: 'run-hardening',
      payload: {
        category: 'hardening',
        action: 'observe',
        outcome: type.endsWith('failed') ? 'FAIL' : 'PASS',
        reasonCode: 'TEST',
        resourceId: 'resource-1',
      },
    });

    assert.equal(event.type, type);
  }
});
