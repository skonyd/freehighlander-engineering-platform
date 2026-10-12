import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EnterpriseDirectoryStateStore } from '@freehighlander/persistence';

import {
  EnterpriseSessionRevocationService,
  enterpriseSessionRevocationCanGrantAuthority,
} from '../dist/index.js';

const organization = {
  schemaVersion: 1,
  organizationId: 'local-default',
  displayName: 'Local Enterprise',
  tenantMode: 'SINGLE_TENANT',
  authority: 'NONE',
};
const actor = {
  schemaVersion: 1,
  actorId: 'actor-oidc',
  kind: 'OIDC_USER',
  displayName: 'Enterprise Operator',
  status: 'ACTIVE',
  authority: 'NONE',
};
const otherActor = {
  ...actor,
  actorId: 'actor-other',
  displayName: 'Other Operator',
};
const session = {
  schemaVersion: 1,
  sessionId: 'session-main',
  organizationId: organization.organizationId,
  actorId: actor.actorId,
  authMethod: 'OIDC',
  createdAt: '2026-10-12T09:00:00+03:00',
  lastValidatedAt: '2026-10-12T09:10:00+03:00',
  expiresAt: '2026-10-12T10:00:00+03:00',
  status: 'ACTIVE',
  rawTokenPersisted: false,
  authority: 'NONE',
};
const otherSession = { ...session, sessionId: 'session-other', actorId: otherActor.actorId };
const secondSession = { ...session, sessionId: 'session-second' };
const localSession = { ...session, sessionId: 'session-local', authMethod: 'LOCAL' };
const request = { verifiedActorId: actor.actorId, sessionId: session.sessionId };

function fixture() {
  const filePath = join(mkdtempSync(join(tmpdir(), 'fh-session-revoke-')), 'directory.json');
  const directory = new EnterpriseDirectoryStateStore(filePath, organization);
  assert.equal(
    directory.write(0, {
      schemaVersion: 1,
      organization,
      actors: [actor, otherActor],
      oidcBindings: [],
      projectMemberships: [],
      sessions: [session, secondSession, otherSession, localSession],
      delegations: [],
    }).status,
    'WRITTEN',
  );
  return {
    filePath,
    directory,
    service: new EnterpriseSessionRevocationService(directory),
  };
}

function statusOf(directory, id) {
  return directory.read().state.sessions.find((entry) => entry.sessionId === id)?.status;
}

test('trusted actor can revoke only its own OIDC session durably', () => {
  const { directory, service, filePath } = fixture();
  const before = directory.read().generation;
  const outcome = service.revoke(request);
  assert.equal(outcome.status, 'REVOKED');
  assert.equal(outcome.reason, null);
  assert.equal(outcome.executionAuthorized, false);
  assert.equal(outcome.humanApprovalSatisfied, false);
  assert.equal(outcome.systemPolicySatisfied, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(enterpriseSessionRevocationCanGrantAuthority(), false);
  assert.equal(directory.read().generation, before + 1);
  assert.equal(statusOf(directory, 'session-main'), 'REVOKED');
  assert.equal(statusOf(directory, 'session-second'), 'ACTIVE');
  assert.equal(statusOf(directory, 'session-other'), 'ACTIVE');

  const restarted = new EnterpriseDirectoryStateStore(filePath, organization);
  assert.equal(statusOf(restarted, 'session-main'), 'REVOKED');
});

test('repeat revocation is idempotent and does not advance store generation', () => {
  const { directory, service } = fixture();
  assert.equal(service.revoke(request).status, 'REVOKED');
  const before = directory.read().generation;
  const repeated = service.revoke(request);
  assert.equal(repeated.status, 'ALREADY_REVOKED');
  assert.equal(repeated.reason, null);
  assert.equal(directory.read().generation, before);
});

test('different actor and unknown session cannot trigger a mutation', () => {
  const { directory, service } = fixture();
  const before = directory.read().generation;
  assert.equal(
    service.revoke({ ...request, verifiedActorId: otherActor.actorId }).reason,
    'SESSION_ACTOR_MISMATCH',
  );
  assert.equal(
    service.revoke({ ...request, sessionId: 'session-does-not-exist' }).reason,
    'SESSION_NOT_FOUND',
  );
  assert.equal(service.revoke({ ...request, sessionId: 'session-local' }).reason, 'SESSION_NOT_OIDC');
  assert.equal(directory.read().generation, before);
  assert.equal(statusOf(directory, 'session-main'), 'ACTIVE');
});

test('malformed actor or session identifiers are denied before reading state', () => {
  let readCalls = 0;
  const directory = { read() { readCalls++; throw new Error('must not read'); } };
  const service = new EnterpriseSessionRevocationService(directory);
  for (const [verifiedActorId, sessionId] of [
    ['?', 'session-main'],
    ['actor-oidc', ' '],
    [null, 'session-main'],
    ['actor-oidc', null],
  ]) {
    const denied = service.revoke({ verifiedActorId, sessionId });
    assert.equal(denied.status, 'DENY');
    assert.equal(denied.reason, 'INVALID_IDENTITY');
  }
  assert.equal(readCalls, 0);
});

test('concurrent directory writes cannot be reported as successful revocation', () => {
  const { directory, service } = fixture();
  const conflictStore = {
    read: () => directory.read(),
    write: () => ({ status: 'GENERATION_CONFLICT' }),
  };
  const concurrent = new EnterpriseSessionRevocationService(conflictStore);
  const conflict = concurrent.revoke(request);
  assert.equal(conflict.status, 'CONFLICT');
  assert.equal(conflict.reason, 'DIRECTORY_WRITE_CONFLICT');
  assert.equal(statusOf(directory, 'session-main'), 'ACTIVE');

  const writerLocked = new EnterpriseSessionRevocationService({
    ...conflictStore,
    write: () => ({ status: 'WRITER_CONFLICT' }),
  });
  assert.equal(writerLocked.revoke(request).status, 'CONFLICT');
  assert.equal(service.revoke(request).status, 'REVOKED');
});

test('corrupt durable state fails closed rather than reporting a revocation', () => {
  const service = new EnterpriseSessionRevocationService({
    read: () => { throw new Error('directory integrity error'); },
  });
  assert.throws(() => service.revoke(request), /directory integrity error/);
});
