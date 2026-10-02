import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  EnterpriseDirectoryStateStore,
  createDefaultEnterpriseDirectoryStateV1,
  enterpriseDirectoryStoreCanGrantAuthority,
  enterpriseDirectoryStoreCanPersistRawTokens,
  enterpriseDirectoryStoreSupportsMultiTenantPersistence,
  validateEnterpriseDirectoryStateV1,
} from '../dist/index.js';

const organization = {
  schemaVersion: 1,
  organizationId: 'local-default',
  displayName: 'Local Enterprise',
  tenantMode: 'SINGLE_TENANT',
  authority: 'NONE',
};

const actorA = {
  schemaVersion: 1,
  actorId: 'actor-a',
  kind: 'OIDC_USER',
  displayName: 'Actor A',
  status: 'ACTIVE',
  authority: 'NONE',
};

const actorB = {
  schemaVersion: 1,
  actorId: 'actor-b',
  kind: 'OIDC_USER',
  displayName: 'Actor B',
  status: 'ACTIVE',
  authority: 'NONE',
};

const state = {
  schemaVersion: 1,
  organization,
  actors: [actorB, actorA],
  oidcBindings: [
    {
      schemaVersion: 1,
      actorId: 'actor-a',
      issuer: 'https://identity.example.test',
      subject: 'subject-a',
      audience: 'freehighlander',
      authority: 'NONE',
    },
  ],
  projectMemberships: [
    {
      schemaVersion: 1,
      organizationId: 'local-default',
      projectId: 'project-main',
      actorId: 'actor-a',
      accessRoles: ['OWNER'],
      authority: 'NONE',
    },
  ],
  sessions: [
    {
      schemaVersion: 1,
      sessionId: 'session-001',
      organizationId: 'local-default',
      actorId: 'actor-a',
      authMethod: 'OIDC',
      createdAt: '2026-10-02T09:00:00+03:00',
      lastValidatedAt: '2026-10-02T09:10:00+03:00',
      expiresAt: '2026-10-02T11:00:00+03:00',
      status: 'ACTIVE',
      rawTokenPersisted: false,
      authority: 'NONE',
    },
  ],
  delegations: [
    {
      schemaVersion: 1,
      organizationId: 'local-default',
      delegationId: 'delegation-001',
      delegatorActorId: 'actor-a',
      delegateActorId: 'actor-b',
      projectId: 'project-main',
      actionClass: 'review-approval',
      validFrom: '2026-10-02T09:00:00+03:00',
      validUntil: '2026-10-02T11:00:00+03:00',
      status: 'ACTIVE',
      authority: 'NONE',
    },
  ],
};

function pathFor(name) {
  const directory = mkdtempSync(join(tmpdir(), 'fh-enterprise-directory-'));
  return join(directory, name);
}

test('enterprise directory defaults empty, authority-neutral and single-tenant', () => {
  const store = new EnterpriseDirectoryStateStore(pathFor('directory.json'), organization);
  const snapshot = store.read();

  assert.equal(snapshot.generation, 0);
  assert.deepEqual(snapshot.state, createDefaultEnterpriseDirectoryStateV1(organization));
  assert.equal(snapshot.snapshotHash, null);
  assert.equal(enterpriseDirectoryStoreCanPersistRawTokens(), false);
  assert.equal(enterpriseDirectoryStoreCanGrantAuthority(), false);
  assert.equal(enterpriseDirectoryStoreSupportsMultiTenantPersistence(), false);
});

test('directory state persists canonically across restart with CAS generation', () => {
  const filePath = pathFor('directory.json');
  const first = new EnterpriseDirectoryStateStore(filePath, organization);
  const written = first.write(0, state);

  assert.equal(written.status, 'WRITTEN');
  assert.equal(written.snapshot?.generation, 1);
  assert.deepEqual(
    written.snapshot?.state.actors.map((actor) => actor.actorId),
    ['actor-a', 'actor-b'],
  );

  const restarted = new EnterpriseDirectoryStateStore(filePath, organization);
  const read = restarted.read();
  assert.equal(read.generation, 1);
  assert.deepEqual(read.state, written.snapshot?.state);

  const conflict = restarted.write(0, state);
  assert.equal(conflict.status, 'GENERATION_CONFLICT');
  assert.equal(conflict.actualGeneration, 1);
});

test('configured organization is exact-bound on write and restart', () => {
  const filePath = pathFor('directory.json');
  const store = new EnterpriseDirectoryStateStore(filePath, organization);

  assert.throws(
    () =>
      store.write(0, {
        ...state,
        organization: { ...organization, organizationId: 'other-org' },
      }),
    /configured organization/,
  );

  const written = store.write(0, state);
  assert.equal(written.status, 'WRITTEN');

  const mismatched = new EnterpriseDirectoryStateStore(filePath, {
    ...organization,
    organizationId: 'other-org',
  });
  assert.throws(() => mismatched.read(), /configured organization/);
});

test('validator rejects malformed root and collection identity drift', () => {
  assert.throws(() => validateEnterpriseDirectoryStateV1(null), /must be an object/);
  assert.throws(
    () => validateEnterpriseDirectoryStateV1({ ...state, schemaVersion: 2 }),
    /schemaVersion/,
  );
  assert.throws(
    () => validateEnterpriseDirectoryStateV1({ ...state, actors: 'bad' }),
    /actors must be an array/,
  );
  assert.throws(
    () => validateEnterpriseDirectoryStateV1({ ...state, actors: [actorA, actorA] }),
    /actors contains duplicate identity/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        oidcBindings: [...state.oidcBindings, { ...state.oidcBindings[0], actorId: 'actor-b' }],
      }),
    /duplicate OIDC subject binding/,
  );
});

test('validator rejects unknown actor and organization references', () => {
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        oidcBindings: [{ ...state.oidcBindings[0], actorId: 'missing-actor' }],
      }),
    /OIDC binding references unknown actor/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        projectMemberships: [
          { ...state.projectMemberships[0], organizationId: 'other-org' },
        ],
      }),
    /project membership organization mismatch/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        projectMemberships: [{ ...state.projectMemberships[0], actorId: 'missing-actor' }],
      }),
    /project membership references unknown actor/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        sessions: [{ ...state.sessions[0], organizationId: 'other-org' }],
      }),
    /session organization mismatch/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        sessions: [{ ...state.sessions[0], actorId: 'missing-actor' }],
      }),
    /session references unknown actor/,
  );
});

test('delegation references are exact and require distinct stored humans', () => {
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        delegations: [{ ...state.delegations[0], organizationId: 'other-org' }],
      }),
    /delegation organization mismatch/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        delegations: [{ ...state.delegations[0], delegatorActorId: 'missing-actor' }],
      }),
    /delegation delegator references unknown actor/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        delegations: [{ ...state.delegations[0], delegateActorId: 'missing-actor' }],
      }),
    /delegation delegate references unknown actor/,
  );
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        delegations: [
          {
            ...state.delegations[0],
            delegateActorId: state.delegations[0].delegatorActorId,
          },
        ],
      }),
    /distinct human actors/,
  );
});

test('strict runtime contracts prevent raw tokens from reaching durable state', () => {
  assert.throws(
    () =>
      validateEnterpriseDirectoryStateV1({
        ...state,
        sessions: [{ ...state.sessions[0], accessToken: 'secret' }],
      }),
    /Unrecognized key/,
  );
});

test('persisted noncanonical ordering fails closed on read', () => {
  const filePath = pathFor('directory.json');
  const store = new EnterpriseDirectoryStateStore(filePath, organization);
  const written = store.write(0, state);
  assert.equal(written.status, 'WRITTEN');

  const persisted = written.snapshot;
  assert.ok(persisted);
  const rawPath = filePath;
  const raw = JSON.parse(await import('node:fs').then(({ readFileSync }) => readFileSync(rawPath, 'utf8')));
  raw.payload.actors.reverse();
  writeFileSync(rawPath, JSON.stringify(raw, null, 2) + '\n');

  assert.throws(() => store.read(), /validator-canonical|hash mismatch/);
});
