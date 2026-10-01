import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorityTelemetryCanContainRawSecrets,
  authorityTelemetryCanGrantAuthority,
  createAuthorityEvent,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

function base(type, action, overrides = {}) {
  return {
    type,
    timestamp: '2026-10-01T07:30:00.000Z',
    runId: 'authority-control-plane',
    revision: {
      repository: 'skonyd/freehighlander-engineering-platform',
      headSha: REVISION,
    },
    payload: {
      action,
      capability: 'GIT_WRITE',
      principalKind: 'HUMAN',
      principalId: 'local-operator',
      exactRevision: REVISION,
      generation: 1,
      outcome: 'APPLIED',
      reasons: [],
      ...overrides,
    },
  };
}

test('authority telemetry records bounded request and exact approval evidence', () => {
  const request = createAuthorityEvent(base('authority.requested', 'REQUEST', { requested: true }));
  assert.equal(request.payload.requested, true);
  assert.equal(request.payload.capability, 'GIT_WRITE');

  const approval = createAuthorityEvent(
    base('authority.approved', 'APPROVE', {
      outcome: 'APPROVED',
      policyHash: HASH,
      approvalRequestHash: HASH,
      humanDecisionHash: HASH,
    }),
  );
  assert.equal(approval.payload.outcome, 'APPROVED');

  const activation = createAuthorityEvent(
    base('authority.activated', 'ACTIVATE', {
      policyHash: HASH,
      approvalRequestHash: HASH,
      humanDecisionHash: HASH,
    }),
  );
  assert.equal(activation.payload.action, 'ACTIVATE');

  const deactivation = createAuthorityEvent(base('authority.deactivated', 'DEACTIVATE'));
  assert.equal(deactivation.payload.action, 'DEACTIVATE');

  assert.equal(authorityTelemetryCanContainRawSecrets(), false);
  assert.equal(authorityTelemetryCanGrantAuthority(), false);
});

test('authority event type is exactly bound to action and request shape', () => {
  assert.throws(
    () => createAuthorityEvent(base('authority.activated', 'REQUEST')),
    /action does not match/,
  );
  assert.throws(
    () => createAuthorityEvent(base('authority.requested', 'REQUEST')),
    /requires requested/,
  );
  assert.throws(
    () => createAuthorityEvent(base('authority.deactivated', 'DEACTIVATE', { requested: false })),
    /requested is valid only/,
  );
  assert.throws(
    () => createAuthorityEvent(base('authority.approved', 'APPROVE')),
    /require approval binding hashes/,
  );
});

test('authority telemetry rejects unknown unsafe or malformed fields', () => {
  const invalid = [
    base('authority.requested', 'REQUEST', { requested: true, extra: 'x' }),
    base('authority.requested', 'REQUEST', { requested: true, capability: 'UNKNOWN' }),
    base('authority.requested', 'REQUEST', { requested: true, principalKind: 'MODEL' }),
    base('authority.requested', 'REQUEST', { requested: true, principalId: 'x' }),
    base('authority.requested', 'REQUEST', { requested: true, exactRevision: 'bad' }),
    base('authority.requested', 'REQUEST', { requested: true, generation: -1 }),
    base('authority.requested', 'REQUEST', { requested: true, outcome: 'UNKNOWN' }),
    base('authority.requested', 'REQUEST', { requested: 'yes' }),
    base('authority.requested', 'REQUEST', { requested: true, policyHash: 'bad' }),
    base('authority.requested', 'REQUEST', { requested: true, reasons: new Array(9).fill('safe') }),
    base('authority.requested', 'REQUEST', { requested: true, reasons: ['line\nbreak'] }),
    base('authority.requested', 'REQUEST', { requested: true, reasons: ['access_token=abc'] }),
  ];

  for (const input of invalid) {
    assert.throws(() => createAuthorityEvent(input));
  }
});
