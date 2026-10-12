import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
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
  PinnedOidcRs256Verifier,
  pinnedOidcVerifierCanGrantAuthority,
  pinnedOidcVerifierCanTrustTokenProvidedKeys,
} from '../dist/index.js';

const NOW = '2026-10-12T10:00:00+03:00';
const ISSUER = 'https://identity.example.test/realms/fh';
const AUDIENCE = 'freehighlander-control';
const NONCE = 'server-nonce-01234567890123456789';
const KID = 'trusted-provider-key-v1';
const IAT = Math.trunc(Date.parse('2026-10-12T09:55:00+03:00') / 1000);
const EXP = Math.trunc(Date.parse('2026-10-12T10:20:00+03:00') / 1000);
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const secondaryKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ecKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const organization = {
  schemaVersion: 1,
  organizationId: 'local-default',
  displayName: 'Local Enterprise',
  tenantMode: 'SINGLE_TENANT',
  authority: 'NONE',
};
const actor = {
  schemaVersion: 1,
  actorId: 'actor-valid',
  kind: 'OIDC_USER',
  displayName: 'Operator',
  status: 'ACTIVE',
  authority: 'NONE',
};
const binding = {
  schemaVersion: 1,
  actorId: 'actor-valid',
  issuer: ISSUER,
  audience: AUDIENCE,
  subject: 'user-subject',
  authority: 'NONE',
};
const headers = { alg: 'RS256', typ: 'JWT', kid: KID };
const claims = {
  iss: ISSUER,
  aud: AUDIENCE,
  sub: binding.subject,
  nonce: NONCE,
  iat: IAT,
  exp: EXP,
  actorId: 'forged-role-should-be-ignored',
  role: 'OWNER',
};

function jwt(header = headers, payload = claims, signingKey = privateKey) {
  const a = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(a + '.' + b), signingKey).toString('base64url');
  return a + '.' + b + '.' + signature;
}

function fixture(overrides = {}) {
  const path = join(mkdtempSync(join(tmpdir(), 'fh-rs256-oidc-')), 'directory.json');
  const directory = new EnterpriseDirectoryStateStore(path, organization);
  const initial = createDefaultEnterpriseDirectoryStateV1(organization);
  assert.equal(
    directory.write(0, {
      ...initial,
      actors: [actor],
      oidcBindings: [binding],
    }).status,
    'WRITTEN',
  );
  const options = {
    directory,
    expectedIssuer: ISSUER,
    expectedAudience: AUDIENCE,
    expectedNonce: NONCE,
    keys: [{ kid: KID, publicKey }],
    now: () => NOW,
    ...overrides,
  };
  return { path, directory, options, verifier: new PinnedOidcRs256Verifier(options) };
}

function write(directory, patch) {
  const snapshot = directory.read();
  assert.equal(directory.write(snapshot.generation, { ...snapshot.state, ...patch }).status, 'WRITTEN');
}

test('valid pinned RS256 signature derives actor only from trusted directory', async () => {
  const { verifier } = fixture();
  const principal = await verifier.verifyIdToken(jwt());
  assert.equal(principal.actorId, actor.actorId);
  assert.equal(principal.issuer, ISSUER);
  assert.equal(principal.audience, AUDIENCE);
  assert.equal(principal.subject, binding.subject);
  assert.equal(principal.signatureVerified, true);
  assert.equal(principal.verificationSource, 'TRUSTED_CONTROL_PLANE_VERIFIER');
  assert.equal(principal.rawTokenPresent, false);
  assert.equal(principal.authority, 'NONE');
  assert.equal(principal.issuedAt, new Date(IAT * 1000).toISOString());
  assert.equal(principal.notBefore, null);
  assert.equal(principal.expiresAt, new Date(EXP * 1000).toISOString());
  assert.equal(pinnedOidcVerifierCanGrantAuthority(), false);
  assert.equal(pinnedOidcVerifierCanTrustTokenProvidedKeys(), false);
});

test('verified ID token can drive durable issuance but raw token is never persisted', async () => {
  const { path, directory, verifier } = fixture();
  const token = jwt();
  const issuer = new EnterpriseOidcSessionIssuer({
    directory,
    verifier,
    expectedIssuer: ISSUER,
    expectedAudience: AUDIENCE,
    now: () => NOW,
  });
  const issued = await issuer.issue(token);
  assert.equal(issued.status, 'ISSUED');
  assert.equal(issued.executionAuthorized, false);
  assert.equal(issued.expiresAt, '2026-10-12T07:15:00.000Z');
  assert.equal(directory.read().state.sessions[0]?.actorId, actor.actorId);
  assert.equal(directory.read().state.sessions[0]?.authMethod, 'OIDC');
  assert.equal(directory.read().state.sessions[0]?.rawTokenPersisted, false);
  assert.equal(readFileSync(path, 'utf8').includes(token), false);
});

test('valid signed nbf is accepted only after nbf and remains trusted metadata', async () => {
  const { verifier } = fixture();
  const principal = await verifier.verifyIdToken(jwt(headers, { ...claims, nbf: IAT }));
  assert.equal(principal.notBefore, new Date(IAT * 1000).toISOString());
});

test('invalid signature, wrong trusted key and unsigned tokens are denied', async () => {
  const { verifier } = fixture();
  const good = jwt();
  const parts = good.split('.');
  for (const candidate of [
    jwt(headers, claims, secondaryKey.privateKey),
    jwt({ ...headers, alg: 'none' }),
    jwt({ ...headers, alg: 'HS256' }),
    jwt({ ...headers, kid: 'untrusted-key' }),
    jwt({ ...headers, jku: 'https://evil.test/jwks.json' }),
    jwt({ ...headers, x5u: 'https://evil.test/cert' }),
    jwt({ ...headers, jwk: { kty: 'RSA' } }),
    jwt({ ...headers, crit: ['unknown'] }),
    jwt({ ...headers, typ: 'not-jwt' }),
    [parts[0], parts[1], 'AA'].join('.'),
    [parts[0], parts[1], 'invalid*signature'].join('.'),
    good + '.extra',
    '',
    'a'.repeat(17_000),
    'malformed',
    JSON.stringify({ fake: true }),
  ]) {
    await assert.rejects(() => verifier.verifyIdToken(candidate), /OIDC ID token verification failed/);
  }

  // Signed bytes and decoded fields cannot be interchanged without invalidating RS256.
  const tamperedClaims = Buffer.from(JSON.stringify({ ...claims, sub: 'other-user' })).toString('base64url');
  await assert.rejects(
    () => verifier.verifyIdToken(parts[0] + '.' + tamperedClaims + '.' + parts[2]),
    /OIDC ID token verification failed/,
  );
});

test('token structure and JOSE header must be exact', async () => {
  const { verifier } = fixture();
  const cases = [
    jwt([], claims),
    jwt(headers, []),
    jwt({ ...headers, kid: null }),
    jwt({ alg: 'RS256', kid: KID }),
    jwt({ ...headers, typ: 'JWT' }),
  ];
  await assert.rejects(() => verifier.verifyIdToken(cases[0]), /OIDC ID token/);
  await assert.rejects(() => verifier.verifyIdToken(cases[1]), /OIDC ID token/);
  await assert.rejects(() => verifier.verifyIdToken(cases[2]), /OIDC ID token/);
  const principal = await verifier.verifyIdToken(cases[3]);
  assert.equal(principal.actorId, actor.actorId);
  assert.equal((await verifier.verifyIdToken(cases[4])).actorId, actor.actorId);

  await assert.rejects(
    () => verifier.verifyIdToken(Buffer.from('null').toString('base64url') + '.' + jwt().split('.').slice(1).join('.')),
    /OIDC ID token/,
  );
});

test('signed but mis-scoped claims fail closed', async () => {
  const { verifier } = fixture();
  const changes = [
    { iss: 'https://other.example.test' },
    { aud: 'different-service' },
    { aud: [AUDIENCE] },
    { sub: '' },
    { sub: 's'.repeat(256) },
    { sub: 'another-user' },
    { nonce: 'attacker-controlled' },
    { iat: EXP + 1 },
    { exp: IAT },
    { exp: IAT - 1 },
    { nbf: EXP + 1 },
    { iat: 'not-numeric' },
    { iat: 1.5 },
    { exp: -1 },
    { nbf: -1 },
    { exp: Number.MAX_SAFE_INTEGER },
    { iat: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const change of changes) {
    await assert.rejects(() => verifier.verifyIdToken(jwt(headers, { ...claims, ...change })), /OIDC ID token/);
  }
});

test('session is never issued for absent binding, inactive actor or LOCAL actor', async () => {
  const { directory, verifier } = fixture();
  write(directory, { oidcBindings: [] });
  await assert.rejects(() => verifier.verifyIdToken(jwt()), /OIDC ID token/);

  write(directory, { oidcBindings: [binding], actors: [{ ...actor, status: 'DISABLED' }] });
  await assert.rejects(() => verifier.verifyIdToken(jwt()), /OIDC ID token/);

  write(directory, { actors: [{ ...actor, kind: 'LOCAL_USER', status: 'ACTIVE' }] });
  await assert.rejects(() => verifier.verifyIdToken(jwt()), /OIDC ID token/);
});

test('malformed trusted clock cannot authenticate tokens', async () => {
  const { verifier } = fixture({ now: () => 'not-a-time' });
  await assert.rejects(() => verifier.verifyIdToken(jwt()), /OIDC ID token/);
});

test('untrusted issuer, nonce, key and clock configurations cannot construct verifier', () => {
  const { options } = fixture();
  const bad = [
    [{ expectedIssuer: 'http://identity.test' }, /trusted HTTPS/],
    [{ expectedIssuer: 'https://identity.test/?x=1' }, /trusted HTTPS/],
    [{ expectedIssuer: 'https://identity.test/#hash' }, /trusted HTTPS/],
    [{ expectedIssuer: 'https://user:pass@identity.test' }, /trusted HTTPS/],
    [{ expectedAudience: '' }, /audience/],
    [{ expectedAudience: ' spaced' }, /audience/],
    [{ expectedNonce: 'short' }, /nonce/],
    [{ expectedNonce: 'x'.repeat(257) }, /nonce/],
    [{ expectedNonce: null }, /nonce/],
    [{ now: null }, /clock/],
    [{ keys: [] }, /signing keys/],
    [{ keys: null }, /signing keys/],
    [{ keys: [{ kid: 'not valid', publicKey }] }, /key ids/],
    [{ keys: [{ kid: KID, publicKey }, { kid: KID, publicKey }] }, /key ids/],
    [{ keys: [{ kid: KID, publicKey: ecKey.publicKey }] }, /RSA public keys/],
    [{ keys: [{ kid: KID, publicKey: privateKey }] }, /RSA public keys/],
    [{ keys: [{ kid: KID, publicKey: null }] }, /RSA public keys/],
    [{ keys: [null] }, /key ids/],
  ];
  for (const [changes, message] of bad) {
    assert.throws(() => new PinnedOidcRs256Verifier({ ...options, ...changes }), message);
  }
  const smallKey = generateKeyPairSync('rsa', { modulusLength: 1024 });
  assert.throws(
    () => new PinnedOidcRs256Verifier({
      ...options,
      keys: [{ kid: 'weak', publicKey: smallKey.publicKey }],
    }),
    /RSA public keys/,
  );
});

test('token verifier reports only generic errors and never leaks raw content', async () => {
  const { verifier } = fixture();
  const raw = 'secret-id-token-content.invalid.invalid';
  await assert.rejects(
    () => verifier.verifyIdToken(raw),
    (error) => error instanceof Error && error.message === 'OIDC ID token verification failed',
  );
});
