import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  EnterpriseDirectoryStateStore,
  createDefaultEnterpriseDirectoryStateV1,
} from '@freehighlander/persistence';

import {
  EnterpriseOidcSessionIssuer,
  enterpriseOidcSessionIssuerCanGrantAuthority,
  enterpriseOidcSessionIssuerCanVerifyTokensItself,
} from '../dist/index.js';

const NOW = '2026-10-12T10:00:00+03:00';
const ISSUER = 'https://identity.example.test';
const AUDIENCE = 'freehighlander';
const RAW_TOKEN = 'private-id-token-should-never-be-stored';
const organization = {
  schemaVersion: 1,
  organizationId: 'local-default',
  displayName: 'Test Enterprise',
  tenantMode: 'SINGLE_TENANT',
  authority: 'NONE',
};
const actor = {
  schemaVersion: 1,
  actorId: 'actor-oidc',
  kind: 'OIDC_USER',
  displayName: 'Verified Operator',
  status: 'ACTIVE',
  authority: 'NONE',
};
const binding = {
  schemaVersion: 1,
  actorId: actor.actorId,
  issuer: ISSUER,
  subject: 'subject-001',
  audience: AUDIENCE,
  authority: 'NONE',
};
const principal = {
  schemaVersion: 1,
  actorId: actor.actorId,
  issuer: ISSUER,
  subject: binding.subject,
  audience: AUDIENCE,
  issuedAt: '2026-10-12T09:50:00+03:00',
  notBefore: null,
  expiresAt: '2026-10-12T11:00:00+03:00',
  verificationSource: 'TRUSTED_CONTROL_PLANE_VERIFIER',
  signatureVerified: true,
  rawTokenPresent: false,
  authority: 'NONE',
};

function fixture(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fh-enterprise-issuer-'));
  const statePath = join(dir, 'directory.json');
  const store = new EnterpriseDirectoryStateStore(statePath, organization);
  const initial = createDefaultEnterpriseDirectoryStateV1(organization);
  const write = store.write(0, {
    ...initial,
    actors: [actor],
    oidcBindings: [binding],
  });
  assert.equal(write.status, 'WRITTEN');
  const verifier = {
    async verifyIdToken(raw) {
      assert.equal(raw, RAW_TOKEN);
      return principal;
    },
  };
  const options = {
    directory: store,
    verifier,
    expectedIssuer: ISSUER,
    expectedAudience: AUDIENCE,
    now: () => NOW,
    ...overrides,
  };
  return { statePath, store, options, issuer: new EnterpriseOidcSessionIssuer(options) };
}

function overwrite(store, changes) {
  const current = store.read();
  assert.equal(
    store.write(current.generation, { ...current.state, ...changes }).status,
    'WRITTEN',
  );
}

test('trusted verifier issues durable session without persisting raw tokens', async () => {
  const { issuer, store, statePath } = fixture();
  const result = await issuer.issue(RAW_TOKEN);
  assert.equal(result.status, 'ISSUED');
  assert.equal(result.reason, null);
  assert.match(result.sessionId, /^oidc-[a-f0-9-]{36}$/);
  assert.equal(result.expiresAt, '2026-10-12T07:15:00.000Z');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.humanApprovalSatisfied, false);
  assert.equal(result.systemPolicySatisfied, false);
  const persisted = store.read().state.sessions[0];
  assert.equal(persisted.sessionId, result.sessionId);
  assert.equal(persisted.authMethod, 'OIDC');
  assert.equal(persisted.actorId, actor.actorId);
  assert.equal(persisted.rawTokenPersisted, false);
  assert.doesNotMatch(readFileSync(statePath, 'utf8'), /private-id-token-should-never-be-stored/);
  assert.equal(enterpriseOidcSessionIssuerCanGrantAuthority(), false);
  assert.equal(enterpriseOidcSessionIssuerCanVerifyTokensItself(), false);
});

test('session cannot outlive upstream OIDC principal', async () => {
  const { issuer } = fixture({
    verifier: {
      async verifyIdToken() {
        return { ...principal, expiresAt: '2026-10-12T10:03:00+03:00' };
      },
    },
  });
  const result = await issuer.issue(RAW_TOKEN);
  assert.equal(result.status, 'ISSUED');
  assert.equal(result.expiresAt, '2026-10-12T07:03:00.000Z');
});

test('invalid token input never reaches the verifier', async () => {
  let calls = 0;
  const { issuer, store } = fixture({
    verifier: {
      async verifyIdToken() {
        calls++;
        return principal;
      },
    },
  });
  for (const token of ['', null, 'a'.repeat(20000)]) {
    const result = await issuer.issue(token);
    assert.equal(result.status, 'DENY');
    assert.equal(result.reason, 'TOKEN_INPUT_INVALID');
    assert.equal(result.sessionId, null);
    assert.equal(result.expiresAt, null);
  }
  assert.equal(calls, 0);
  assert.deepEqual(store.read().state.sessions, []);
});

test('verifier errors and malformed metadata never expose token', async () => {
  const cases = [
    {
      async verifyIdToken() {
        throw new Error('raw token: ' + RAW_TOKEN);
      },
    },
    {
      async verifyIdToken() {
        return { ...principal, signatureVerified: false };
      },
    },
    {
      async verifyIdToken() {
        return { ...principal, accessToken: RAW_TOKEN };
      },
    },
  ];
  for (const verifier of cases) {
    const { issuer, store } = fixture({ verifier });
    const result = await issuer.issue(RAW_TOKEN);
    assert.equal(result.status, 'DENY');
    assert.equal(result.reason, 'OIDC_VERIFICATION_FAILED');
    assert.doesNotMatch(JSON.stringify(result), /private-id-token-should-never-be-stored/);
    assert.deepEqual(store.read().state.sessions, []);
  }
});

test('missing subject binding or actor cannot issue an enterprise session', async () => {
  const { issuer, store } = fixture();
  overwrite(store, { oidcBindings: [] });
  const missingBinding = await issuer.issue(RAW_TOKEN);
  assert.equal(missingBinding.reason, 'OIDC_IDENTITY_NOT_BOUND');

  // Model a corrupted/inconsistent internal snapshot. The service fails
  // closed even before the durable store itself rejects this graph.
  const unboundActor = {
    read: () => ({
      generation: 0,
      state: {
        ...store.read().state,
        oidcBindings: [binding],
        actors: [],
      },
    }),
  };
  const other = new EnterpriseOidcSessionIssuer({ ...issuer.options, directory: unboundActor });
  const missingActor = await other.issue(RAW_TOKEN);
  assert.equal(missingActor.reason, 'OIDC_IDENTITY_NOT_BOUND');
});

test('expired mismatched and disabled verified identity remain denied', async () => {
  const { issuer, store } = fixture({ expectedAudience: 'different-audience' });
  const wrongAudience = await issuer.issue(RAW_TOKEN);
  assert.equal(wrongAudience.reason, 'OIDC_CLAIMS_REJECTED');

  const invalid = new EnterpriseOidcSessionIssuer({
    ...issuer.options,
    verifier: {
      async verifyIdToken() {
        return { ...principal, expiresAt: '2026-10-12T09:59:00+03:00' };
      },
    },
  });
  assert.equal((await invalid.issue(RAW_TOKEN)).reason, 'OIDC_CLAIMS_REJECTED');

  overwrite(store, { actors: [{ ...actor, status: 'DISABLED' }] });
  assert.equal((await issuer.issue(RAW_TOKEN)).reason, 'OIDC_CLAIMS_REJECTED');
  assert.deepEqual(store.read().state.sessions, []);
});

test('CAS conflict never creates or reports an authenticated session', async () => {
  const { issuer, store } = fixture();
  const conflictDirectory = {
    read: () => store.read(),
    write: () => ({ status: 'GENERATION_CONFLICT' }),
  };
  const other = new EnterpriseOidcSessionIssuer({
    ...issuer.options,
    directory: conflictDirectory,
  });
  const result = await other.issue(RAW_TOKEN);
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.reason, 'DIRECTORY_WRITE_CONFLICT');
  assert.equal(result.sessionId, null);
  assert.deepEqual(store.read().state.sessions, []);
});

test('unexpected trusted clock and configuration fail closed', async () => {
  const { issuer } = fixture();
  const invalidClock = new EnterpriseOidcSessionIssuer({
    ...issuer.options,
    now: () => 'not-a-time',
  });
  await assert.rejects(() => invalidClock.issue(RAW_TOKEN), /trusted clock/);

  assert.throws(
    () => new EnterpriseOidcSessionIssuer({ ...issuer.options, verifier: null }),
    /trusted OIDC verifier/,
  );
  const insecureOptions = { ...issuer.options, expectedIssuer: 'http://example.test' };
  assert.throws(() => new EnterpriseOidcSessionIssuer(insecureOptions), /must use HTTPS/);
  assert.throws(
    () => new EnterpriseOidcSessionIssuer({ ...issuer.options, expectedAudience: '   ' }),
    /expectedAudience/,
  );
  assert.throws(
    () => new EnterpriseOidcSessionIssuer({ ...issuer.options, now: null }),
    /trusted clock/,
  );
});
