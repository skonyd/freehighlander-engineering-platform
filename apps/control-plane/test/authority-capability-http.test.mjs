import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createAuthorityCapabilityHttpServer,
  startAuthorityCapabilityHttpServer,
} from '../bin/authority-server.mjs';

const ORIGIN = 'http://127.0.0.1:4310';
const CSRF = 'c'.repeat(64);
const REVISION = 'a'.repeat(40);

function options() {
  const directory = mkdtempSync(join(tmpdir(), 'fh-authority-http-'));
  return {
    statePath: join(directory, 'authority.json'),
    repository: 'skonyd/freehighlander-engineering-platform',
    revision: REVISION,
    approverId: 'local-operator',
    allowedOrigin: ORIGIN,
    csrfToken: CSRF,
    port: 0,
  };
}

async function withServer(run) {
  const started = await startAuthorityCapabilityHttpServer(options());
  try {
    await run(started.url);
  } finally {
    await started.close();
  }
}

async function post(url, pathname, body, headers = {}) {
  return fetch(url + pathname, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-freehighlander-csrf': CSRF,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('authority server validates trusted transport configuration', () => {
  assert.throws(
    () => createAuthorityCapabilityHttpServer({ ...options(), allowedOrigin: 'file:///tmp/x' }),
    /allowedOrigin must use http or https/,
  );
  assert.throws(
    () => createAuthorityCapabilityHttpServer({ ...options(), allowedOrigin: ORIGIN + '/path' }),
    /allowedOrigin must be an exact origin/,
  );
  assert.throws(
    () => createAuthorityCapabilityHttpServer({ ...options(), csrfToken: 'bad' }),
    /csrfToken must be a 64-character lowercase hex token/,
  );
});

test('snapshot starts default DENY and session token is origin protected', async () => {
  await withServer(async (url) => {
    const snapshotResponse = await fetch(url + '/v1/authority');
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshotResponse.headers.get('x-freehighlander-authority-plane'), 'control-plane');
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.generation, 0);
    assert.deepEqual(snapshot.state.requestedCapabilities, []);
    assert.deepEqual(snapshot.state.activeCapabilities, []);
    assert.equal(snapshot.approvals.GIT_WRITE, null);

    const deniedSession = await fetch(url + '/v1/authority/session');
    assert.equal(deniedSession.status, 403);

    const sessionResponse = await fetch(url + '/v1/authority/session', {
      headers: { origin: ORIGIN },
    });
    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionResponse.headers.get('access-control-allow-origin'), ORIGIN);
    const session = await sessionResponse.json();
    assert.equal(session.csrfToken, CSRF);
  });
});

test('CORS preflight and mutation security fail closed', async () => {
  await withServer(async (url) => {
    const deniedPreflight = await fetch(url + '/v1/authority/request', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(deniedPreflight.status, 403);

    const preflight = await fetch(url + '/v1/authority/request', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);

    const noOrigin = await fetch(url + '/v1/authority/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-freehighlander-csrf': CSRF },
      body: JSON.stringify({
        capability: 'GIT_WRITE',
        requested: true,
        expectedGeneration: 0,
      }),
    });
    assert.equal(noOrigin.status, 403);

    const badCsrf = await post(
      url,
      '/v1/authority/request',
      { capability: 'GIT_WRITE', requested: true, expectedGeneration: 0 },
      { 'x-freehighlander-csrf': '0'.repeat(64) },
    );
    assert.equal(badCsrf.status, 403);

    const wrongMethod = await fetch(url + '/v1/authority/request', {
      method: 'GET',
      headers: { origin: ORIGIN },
    });
    assert.equal(wrongMethod.status, 405);
  });
});

test('request approve activate deactivate completes the real authority lifecycle', async () => {
  await withServer(async (url) => {
    const requested = await post(url, '/v1/authority/request', {
      capability: 'GIT_WRITE',
      requested: true,
      expectedGeneration: 0,
    });
    assert.equal(requested.status, 200);
    const requestedBody = await requested.json();
    assert.equal(requestedBody.result.status, 'APPLIED');
    assert.deepEqual(requestedBody.result.state.activeCapabilities, []);

    const approved = await post(url, '/v1/authority/approve', {
      capability: 'GIT_WRITE',
      expectedGeneration: 1,
    });
    assert.equal(approved.status, 200);
    const approvedBody = await approved.json();
    assert.equal(approvedBody.result.status, 'APPROVED');
    assert.match(approvedBody.result.approval.requestHash, /^[a-f0-9]{64}$/);

    const activated = await post(url, '/v1/authority/activate', {
      capability: 'GIT_WRITE',
      expectedGeneration: 1,
    });
    assert.equal(activated.status, 200);
    const activatedBody = await activated.json();
    assert.equal(activatedBody.result.status, 'APPLIED');
    assert.deepEqual(activatedBody.result.state.activeCapabilities, ['GIT_WRITE']);

    const snapshot = await (await fetch(url + '/v1/authority')).json();
    assert.equal(snapshot.generation, 2);
    assert.equal(snapshot.approvals.GIT_WRITE.capability, 'GIT_WRITE');

    const deactivated = await post(url, '/v1/authority/deactivate', {
      capability: 'GIT_WRITE',
      expectedGeneration: 2,
    });
    assert.equal(deactivated.status, 200);
    assert.deepEqual((await deactivated.json()).result.state.activeCapabilities, []);
  });
});

test('blocked and stale lifecycle operations return structured conflict responses', async () => {
  await withServer(async (url) => {
    const approveBeforeRequest = await post(url, '/v1/authority/approve', {
      capability: 'GIT_WRITE',
      expectedGeneration: 0,
    });
    assert.equal(approveBeforeRequest.status, 409);
    assert.equal((await approveBeforeRequest.json()).result.status, 'BLOCKED');

    const activateBeforeApproval = await post(url, '/v1/authority/activate', {
      capability: 'GIT_WRITE',
      expectedGeneration: 0,
    });
    assert.equal(activateBeforeApproval.status, 409);
    assert.equal((await activateBeforeApproval.json()).result.status, 'BLOCKED');

    await post(url, '/v1/authority/request', {
      capability: 'GIT_WRITE',
      requested: true,
      expectedGeneration: 0,
    });

    const stale = await post(url, '/v1/authority/request', {
      capability: 'RELEASE_DEPLOY',
      requested: true,
      expectedGeneration: 0,
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).result.status, 'CONFLICT');
  });
});

test('input parser rejects client-supplied trust and malformed bodies', async () => {
  await withServer(async (url) => {
    const cases = [
      [{ capability: 'UNKNOWN', requested: true, expectedGeneration: 0 }, /unknown authority/],
      [{ capability: 'GIT_WRITE', requested: 'yes', expectedGeneration: 0 }, /requested/],
      [{ capability: 'GIT_WRITE', requested: true, expectedGeneration: -1 }, /expectedGeneration/],
      [
        {
          capability: 'GIT_WRITE',
          requested: true,
          expectedGeneration: 0,
          exactHumanApprovalVerified: true,
        },
        /unknown field/,
      ],
    ];

    for (const [body, pattern] of cases) {
      const response = await post(url, '/v1/authority/request', body);
      assert.equal(response.status, 400);
      assert.match((await response.json()).message, pattern);
    }

    const scalar = await post(url, '/v1/authority/request', '[]');
    assert.equal(scalar.status, 400);

    const invalidJson = await post(url, '/v1/authority/request', '{');
    assert.equal(invalidJson.status, 400);
    assert.match((await invalidJson.json()).message, /valid JSON/);

    const empty = await fetch(url + '/v1/authority/request', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-freehighlander-csrf': CSRF,
      },
    });
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).message, /body is required/);

    const oversized = await post(url, '/v1/authority/request', 'x'.repeat(17000));
    assert.equal(oversized.status, 400);
    assert.match((await oversized.json()).message, /exceeds/);
  });
});

test('unknown paths are 404 with CORS only for the trusted origin', async () => {
  await withServer(async (url) => {
    const trusted = await fetch(url + '/missing', { headers: { origin: ORIGIN } });
    assert.equal(trusted.status, 404);
    assert.equal(trusted.headers.get('access-control-allow-origin'), ORIGIN);

    const untrusted = await fetch(url + '/missing', {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(untrusted.status, 404);
    assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
  });
});
