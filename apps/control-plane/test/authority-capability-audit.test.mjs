import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryEventSink } from '@freehighlander/telemetry';

import {
  AuthorityCapabilityAuditRecorder,
  authorityAuditRecorderCanGrantAuthority,
} from '../dist/index.js';

const REVISION = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

test('audit recorder appends exact redacted authority events', async () => {
  const sink = new InMemoryEventSink();
  const recorder = new AuthorityCapabilityAuditRecorder(sink, {
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: REVISION,
    principalId: 'local-operator',
    now: () => new Date('2026-10-01T07:30:00.000Z'),
  });

  const event = await recorder.record({
    type: 'authority.approved',
    capability: 'GIT_WRITE',
    generation: 1,
    outcome: 'APPROVED',
    reasons: [],
    policyHash: HASH,
    approvalRequestHash: HASH,
    humanDecisionHash: HASH,
  });

  assert.equal(sink.events.length, 1);
  assert.equal(event.timestamp, '2026-10-01T07:30:00.000Z');
  assert.equal(event.payload.principalId, 'local-operator');
  assert.equal(event.payload.exactRevision, REVISION);
  assert.equal(event.payload.policyHash, HASH);
  assert.equal(authorityAuditRecorderCanGrantAuthority(), false);
});

test('audit recorder supports all four authority lifecycle actions', async () => {
  const sink = new InMemoryEventSink();
  const recorder = new AuthorityCapabilityAuditRecorder(sink, {
    repository: 'repo/name',
    exactRevision: REVISION,
    principalId: 'operator-1',
  });

  await recorder.record({
    type: 'authority.requested',
    capability: 'GIT_WRITE',
    generation: 1,
    outcome: 'APPLIED',
    reasons: [],
    requested: true,
  });
  await recorder.record({
    type: 'authority.approved',
    capability: 'RELEASE_DEPLOY',
    generation: 2,
    outcome: 'APPROVED',
    reasons: [],
    policyHash: HASH,
    approvalRequestHash: HASH,
    humanDecisionHash: HASH,
  });
  await recorder.record({
    type: 'authority.activated',
    capability: 'INFRASTRUCTURE_MUTATION',
    generation: 3,
    outcome: 'APPLIED',
    reasons: [],
    policyHash: HASH,
    approvalRequestHash: HASH,
    humanDecisionHash: HASH,
  });
  await recorder.record({
    type: 'authority.deactivated',
    capability: 'AUTOMATIC_REMEDIATION',
    generation: 4,
    outcome: 'APPLIED',
    reasons: ['operator revocation'],
  });

  assert.deepEqual(
    sink.events.map((event) => event.payload.action),
    ['REQUEST', 'APPROVE', 'ACTIVATE', 'DEACTIVATE'],
  );
});

test('audit recorder validates trusted identity before accepting events', () => {
  const sink = new InMemoryEventSink();

  assert.throws(
    () =>
      new AuthorityCapabilityAuditRecorder(sink, {
        repository: '',
        exactRevision: REVISION,
        principalId: 'operator-1',
      }),
    /repository is required/,
  );
  assert.throws(
    () =>
      new AuthorityCapabilityAuditRecorder(sink, {
        repository: 'repo/name',
        exactRevision: 'bad',
        principalId: 'operator-1',
      }),
    /full git SHA/,
  );
  assert.throws(
    () =>
      new AuthorityCapabilityAuditRecorder(sink, {
        repository: 'repo/name',
        exactRevision: REVISION,
        principalId: 'x',
      }),
    /principalId is invalid/,
  );
});
